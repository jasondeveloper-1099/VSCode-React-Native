// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as Q from "q";
import * as path from "path";
import * as WebSocket from "ws";
import { EventEmitter } from "events";
import { ensurePackagerRunning } from "../common/packagerStatus";
import {ErrorHelper} from "../common/error/errorHelper";
import { logger } from "vscode-chrome-debug-core";
import {ExecutionsLimiter} from "../common/executionsLimiter";
import { FileSystem as NodeFileSystem} from "../common/node/fileSystem";
import { ForkedAppWorker } from "./forkedAppWorker";
import { ScriptImporter } from "./scriptImporter";
import { ReactNativeProjectHelper } from "../common/reactNativeProjectHelper";

export interface RNAppMessage {
    method: string;
    url?: string;
    // These objects have also other properties but that we don't currently use
}

export interface IDebuggeeWorker {
    start(): Q.Promise<any>;
    stop(): void;
    postMessage(message: RNAppMessage): void;
}

function printDebuggingError(message: string, reason: any) {
    const nestedError = ErrorHelper.getNestedWarning(reason, `${message}. Debugging won't work: Try reloading the JS from inside the app, or Reconnect the VS Code debugger`);

    logger.error(nestedError.message);
}

    /** This class will create a SandboxedAppWorker that will run the RN App logic, and then create a socket
     * and send the RN App messages to the SandboxedAppWorker. The only RN App message that this class handles
     * is the prepareJSRuntime, which we reply to the RN App that the sandbox was created successfully.
     * When the socket closes, we'll create a new SandboxedAppWorker and a new socket pair and discard the old ones.
     */

export class MultipleLifetimesAppWorker extends EventEmitter {
    public static WORKER_BOOTSTRAP = `
// Initialize some variables before react-native code would access them
var onmessage=null, self=global;
// Cache Node's original require as __debug__.require
global.__debug__={require: require};
// avoid Node's GLOBAL deprecation warning
Object.defineProperty(global, "GLOBAL", {
    configurable: true,
    writable: true,
    enumerable: true,
    value: global
});
// Prevent leaking process.versions from debugger process to
// worker because pure React Native doesn't do that and some packages as js-md5 rely on this behavior
Object.defineProperty(process, "versions", {
    value: undefined
});

var vscodeHandlers = {
    'vscode_reloadApp': function () {
        try {
            global.require('NativeModules').DevMenu.reload();
        } catch (err) {
            // ignore
        }
    },
    'vscode_showDevMenu': function () {
        try {
            var DevMenu = global.require('NativeModules').DevMenu.show();
        } catch (err) {
            // ignore
        }
    }
};

process.on("message", function (message) {
    if (message.data && vscodeHandlers[message.data.method]) {
        vscodeHandlers[message.data.method]();
    } else if(onmessage) {
        onmessage(message);
    }
});

var postMessage = function(message){
    process.send(message);
};

if (!self.postMessage) {
    self.postMessage = postMessage;
}

var importScripts = (function(){
    var fs=require('fs'), vm=require('vm');
    return function(scriptUrl){
        var scriptCode = fs.readFileSync(scriptUrl, "utf8");
        vm.runInThisContext(scriptCode, {filename: scriptUrl});
    };
})();`;

    public static WORKER_DONE = `// Notify debugger that we're done with loading
// and started listening for IPC messages
postMessage({workerLoaded:true});`;

    public static FETCH_STUB = `(function(self) {
        'use strict';

        if (self.fetch) {
          return
        }

        self.fetch = fetch;

        function fetch(url) {
            return new Promise((resolve, reject) => {
                var data = require("fs").readFileSync(url, 'utf8');
                resolve(
                    {
                        text: function () {
                            return data;
                        }
                    });
            });
        }
      })(global);`;

    private packagerAddress: string;
    private packagerPort: number;
    private sourcesStoragePath: string;
    private projectRootPath: string;
    private packagerRemoteRoot?: string;
    private packagerLocalRoot?: string;
    private socketToApp: WebSocket;
    private singleLifetimeWorker: IDebuggeeWorker | null;
    private webSocketConstructor: (url: string) => WebSocket;

    private executionLimiter = new ExecutionsLimiter();
    private nodeFileSystem = new NodeFileSystem();
    private scriptImporter: ScriptImporter;

    constructor(
        attachRequestArguments: any,
        sourcesStoragePath: string,
        projectRootPath: string,
        {
            webSocketConstructor = (url: string) => new WebSocket(url),
        } = {}) {
        super();
        this.packagerAddress = attachRequestArguments.address || "localhost";
        this.packagerPort = attachRequestArguments.port;
        this.packagerRemoteRoot = attachRequestArguments.remoteRoot;
        this.packagerLocalRoot = attachRequestArguments.localRoot;
        this.sourcesStoragePath = sourcesStoragePath;
        this.projectRootPath = projectRootPath;
        console.assert(!!this.sourcesStoragePath, "The sourcesStoragePath argument was null or empty");

        this.webSocketConstructor = webSocketConstructor;
        this.scriptImporter = new ScriptImporter(this.packagerAddress, this.packagerPort, sourcesStoragePath, this.packagerRemoteRoot, this.packagerLocalRoot);
    }

    public start(retryAttempt: boolean = false): Q.Promise<any> {
        const errPackagerNotRunning = new Error(`Cannot attach to packager. Are you sure there is a packager and it is running in the port ${this.packagerPort}? If your packager is configured to run in another port make sure to add that to the setting.json.`);

        return ensurePackagerRunning(this.packagerAddress, this.packagerPort, errPackagerNotRunning)
            .then(() => {
                // Don't fetch debugger worker on socket disconnect
                return retryAttempt ? Q.resolve<void>(void 0) :
                    this.downloadAndPatchDebuggerWorker();
            })
            .then(() => this.createSocketToApp(retryAttempt));
    }

    public stop() {
        if (this.socketToApp) {
            this.socketToApp.removeAllListeners();
            this.socketToApp.close();
        }

        if (this.singleLifetimeWorker) {
            this.singleLifetimeWorker.stop();
        }
    }

    public downloadAndPatchDebuggerWorker(): Q.Promise<void> {
        let scriptToRunPath = path.resolve(this.sourcesStoragePath, ScriptImporter.DEBUGGER_WORKER_FILENAME);
        return this.scriptImporter.downloadDebuggerWorker(this.sourcesStoragePath, this.projectRootPath)
            .then(() => this.nodeFileSystem.readFile(scriptToRunPath, "utf8"))
            .then((workerContent: string) => {
                const isHaulProject = ReactNativeProjectHelper.isHaulProject(this.projectRootPath);
                // Add our customizations to debugger worker to get it working smoothly
                // in Node env and polyfill WebWorkers API over Node's IPC.
                const modifiedDebuggeeContent = [
                    MultipleLifetimesAppWorker.WORKER_BOOTSTRAP,
                    isHaulProject ? MultipleLifetimesAppWorker.FETCH_STUB : null,
                    workerContent,
                    MultipleLifetimesAppWorker.WORKER_DONE,
                ].join("\n");
                return this.nodeFileSystem.writeFile(scriptToRunPath, modifiedDebuggeeContent);
            });
    }

    private startNewWorkerLifetime(): Q.Promise<void> {
        this.singleLifetimeWorker = new ForkedAppWorker(this.packagerAddress, this.packagerPort, this.sourcesStoragePath, this.projectRootPath,
            (message) => {
                this.sendMessageToApp(message);
            },
            this.packagerRemoteRoot, this.packagerLocalRoot);
        logger.verbose("A new app worker lifetime was created.");
        return this.singleLifetimeWorker.start()
            .then(startedEvent => {
                this.emit("connected", startedEvent);
            });
    }

    private createSocketToApp(retryAttempt: boolean = false): Q.Promise<void> {
        let deferred = Q.defer<void>();
        this.socketToApp = this.webSocketConstructor(this.debuggerProxyUrl());
        this.socketToApp.on("open", () => {
            this.onSocketOpened();
        });
        this.socketToApp.on("close",
            () => {
                this.executionLimiter.execute("onSocketClose.msg", /*limitInSeconds*/ 10, () => {
                    /*
                     * It is not the best idea to compare with the message, but this is the only thing React Native gives that is unique when
                     * it closes the socket because it already has a connection to a debugger.
                     * https://github.com/facebook/react-native/blob/588f01e9982775f0699c7bfd56623d4ed3949810/local-cli/server/util/webSocketProxy.js#L38
                     */
                    let msgKey = "_closeMessage";
                    if (this.socketToApp[msgKey] === "Another debugger is already connected") {
                        deferred.reject(new RangeError("Another debugger is already connected to packager. Please close it before trying to debug with VSCode."));
                    }
                    logger.log("Disconnected from the Proxy (Packager) to the React Native application. Retrying reconnection soon...");
                });
                setTimeout(() => {
                  this.start(true /* retryAttempt */);
                }, 100);
            });
        this.socketToApp.on("message",
            (message: any) => this.onMessage(message));
        this.socketToApp.on("error",
            (error: Error) => {
                if (retryAttempt) {
                    printDebuggingError("Reconnection to the proxy (Packager) failed. Please check the output window for Packager errors, if any. If failure persists, please restart the React Native debugger.", error);
                }

                deferred.reject(error);
            });

        // In an attempt to catch failures in starting the packager on first attempt,
        // wait for 300 ms before resolving the promise
        Q.delay(300).done(() => deferred.resolve(void 0));
        return deferred.promise;
    }

    private debuggerProxyUrl() {
        return `ws://${this.packagerAddress}:${this.packagerPort}/debugger-proxy?role=debugger&name=vscode`;
    }

    private onSocketOpened() {
        this.executionLimiter.execute("onSocketOpened.msg", /*limitInSeconds*/ 10, () =>
            logger.log("Established a connection with the Proxy (Packager) to the React Native application"));
    }

    private killWorker() {
        if (!this.singleLifetimeWorker) return;
        this.singleLifetimeWorker.stop();
        this.singleLifetimeWorker = null;
    }

    private onMessage(message: string) {
        try {
            logger.verbose("From RN APP: " + message);
            let object = <RNAppMessage>JSON.parse(message);
            if (object.method === "prepareJSRuntime") {
                // In RN 0.40 Android runtime doesn't seem to be sending "$disconnected" event
                // when user reloads an app, hence we need to try to kill it here either.
                this.killWorker();
                // The MultipleLifetimesAppWorker will handle prepareJSRuntime aka create new lifetime
                this.gotPrepareJSRuntime(object);
            } else if (object.method === "$disconnected") {
                // We need to shutdown the current app worker, and create a new lifetime
                this.killWorker();
            } else if (object.method) {
                // All the other messages are handled by the single lifetime worker
                if (this.singleLifetimeWorker) {
                    this.singleLifetimeWorker.postMessage(object);
                }
            } else {
                // Message doesn't have a method. Ignore it. This is an info message instead of warn because it's normal and expected
                logger.verbose("The react-native app sent a message without specifying a method: " + message);
            }
        } catch (exception) {
            printDebuggingError(`Failed to process message from the React Native app. Message:\n${message}`, exception);
        }
    }

    private gotPrepareJSRuntime(message: any): void {
        // Create the sandbox, and replay that we finished processing the message
        this.startNewWorkerLifetime().done(() => {
            this.sendMessageToApp({ replyID: parseInt(message.id, 10) });
        }, error => printDebuggingError(`Failed to prepare the JavaScript runtime environment. Message:\n${message}`, error));
    }

    private sendMessageToApp(message: any): void {
        let stringified: string = "";
        try {
            stringified = JSON.stringify(message);
            logger.verbose("To RN APP: " + stringified);
            this.socketToApp.send(stringified);
        } catch (exception) {
            let messageToShow = stringified || ("" + message); // Try to show the stringified version, but show the toString if unavailable
            printDebuggingError(`Failed to send message to the React Native app. Message:\n${messageToShow}`, exception);
        }
    }
}
