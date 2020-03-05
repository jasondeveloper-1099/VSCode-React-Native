// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Q from "q";
import * as path from "path";
import * as fs from "fs";
import * as mkdirp from "mkdirp";
import stripJsonComments = require("strip-json-comments");
import { LoggingDebugSession, Logger, logger } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { getLoggingDirectory, LogHelper } from "../extension/log/LogHelper";
import { ReactNativeProjectHelper } from "../common/reactNativeProjectHelper";
import { ErrorHelper } from "../common/error/errorHelper";
import { InternalErrorCode } from "../common/error/internalErrorCode";
import { ILaunchArgs } from "../extension/launchArgs";
import { ProjectVersionHelper } from "../common/projectVersionHelper";
import { TelemetryHelper } from "../common/telemetryHelper";
import { AppLauncher } from "../extension/appLauncher";
import { MultipleLifetimesAppWorker } from "./appWorker";
import { ReactNativeCDPProxy } from "../cdp-proxy/reactNativeCDPProxy";
import { generateRandomPortNumber } from "../common/extensionHelper";
import { LogLevel } from "../extension/log/LogHelper";
import * as nls from "vscode-nls";
const localize = nls.loadMessageBundle();

export interface IAttachRequestArgs extends DebugProtocol.AttachRequestArguments, ILaunchArgs {
    cwd: string; /* Automatically set by VS Code to the currently opened folder */
    port: number;
    url?: string;
    address?: string;
    trace?: string;
}

export interface ILaunchRequestArgs extends DebugProtocol.LaunchRequestArguments, IAttachRequestArgs { }

export class RNDebugSession extends LoggingDebugSession {

    private readonly CDP_PROXY_PORT = generateRandomPortNumber();
    private readonly CDP_PROXY_HOST_ADDRESS = "127.0.0.1";

    private appLauncher: AppLauncher;
    private appWorker: MultipleLifetimesAppWorker | null = null;
    private projectRootPath: string;
    private isSettingsInitialized: boolean; // used to prevent parameters reinitialization when attach is called from launch function
    private previousAttachArgs: IAttachRequestArgs;
    private rnCdpProxy: ReactNativeCDPProxy | null = null;
    private cdpProxyLogLevel: LogLevel;

    constructor(private session: vscode.DebugSession) {
        super();
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        super.initializeRequest(response, args);
    }

    protected launchRequest(response: DebugProtocol.LaunchResponse, launchArgs: ILaunchRequestArgs, request?: DebugProtocol.Request): Promise<void> {
        return new Promise<void>((resolve, reject) => this.initializeSettings(launchArgs)
            .then(() => {
                logger.log("Launching the application");
                logger.verbose(`Launching the application: ${JSON.stringify(launchArgs, null , 2)}`);

                this.appLauncher.launch(launchArgs)
                    .then(() => {
                        return this.appLauncher.getPackagerPort(launchArgs.cwd);
                    })
                    .then((packagerPort: number) => {
                        launchArgs.port = launchArgs.port || packagerPort;
                        this.attachRequest(response, launchArgs).then(() => {
                            resolve();
                        }).catch((e) => reject(e));
                    })
                    .catch((err) => {
                        logger.error("An error occurred while attaching to the debugger. " + err.message || err);
                        reject(err);
                    });
            }));
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, attachArgs: IAttachRequestArgs, request?: DebugProtocol.Request): Promise<void>  {
        let extProps = {
            platform: {
                value: attachArgs.platform,
                isPii: false,
            },
        };

        this.previousAttachArgs = attachArgs;
        return new Promise<void>((resolve, reject) => this.initializeSettings(attachArgs)
            .then(() => {
                logger.log("Attaching to the application");
                logger.verbose(`Attaching to the application: ${JSON.stringify(attachArgs, null , 2)}`);
                return ProjectVersionHelper.getReactNativeVersions(attachArgs.cwd, true)
                    .then(versions => {
                        extProps = TelemetryHelper.addPropertyToTelemetryProperties(versions.reactNativeVersion, "reactNativeVersion", extProps);
                        if (!ProjectVersionHelper.isVersionError(versions.reactNativeWindowsVersion)) {
                            extProps = TelemetryHelper.addPropertyToTelemetryProperties(versions.reactNativeWindowsVersion, "reactNativeWindowsVersion", extProps);
                        }
                        return TelemetryHelper.generate("attach", extProps, (generator) => {
                            this.rnCdpProxy = new ReactNativeCDPProxy(this.CDP_PROXY_PORT, this.CDP_PROXY_HOST_ADDRESS, this.cdpProxyLogLevel);
                            return this.rnCdpProxy.createServer()
                                .then(() => {
                                    logger.log(localize("StartingDebuggerAppWorker", "Starting debugger app worker."));

                                    const sourcesStoragePath = path.join(this.projectRootPath, ".vscode", ".react");
                                    // Create folder if not exist to avoid problems if
                                    // RN project root is not a ${workspaceFolder}
                                    mkdirp.sync(sourcesStoragePath);

                                    // If launch is invoked first time, appWorker is undefined, so create it here
                                    this.appWorker = new MultipleLifetimesAppWorker(
                                        attachArgs,
                                        sourcesStoragePath,
                                        this.projectRootPath,
                                        undefined);

                                    this.appWorker.on("connected", (port: number) => {
                                        logger.log(localize("DebuggerWorkerLoadedRuntimeOnPort", "Debugger worker loaded runtime on port {0}", port));

                                        if (this.rnCdpProxy) {
                                            const attachArguments = {
                                                type: "pwa-node",
                                                request: "attach",
                                                name: "Attach",
                                                port: port,
                                                inspectUri: this.rnCdpProxy.getInspectUriTemplate(),
                                            };

                                            vscode.debug.startDebugging(
                                                this.appLauncher.getWorkspaceFolder(),
                                                attachArguments,
                                                this.session
                                            )
                                            .then((childDebugSessionStarted: boolean) => {
                                                if (childDebugSessionStarted) {
                                                    resolve();
                                                } else {
                                                    reject(new Error("Cannot start child debug session"));
                                                }
                                            },
                                            err => {
                                                reject(err);
                                            });
                                        } else {
                                            throw new Error("Cannot connect to debugger worker: Chrome debugger proxy is offline");
                                        }
                                    });

                                    return this.appWorker.start();
                                });
                        })
                        .catch((err) => {
                            logger.error("An error occurred while attaching to the debugger. " + err.message || err);
                            reject(err);
                        });
                    });
        }));
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
        // The client is about to disconnect so first we need to stop app worker
        if (this.appWorker) {
            this.appWorker.stop();
        }

        if (this.rnCdpProxy) {
            this.rnCdpProxy.stopServer();
            this.rnCdpProxy = null;
        }

        // Then we tell the extension to stop monitoring the logcat, and then we disconnect the debugging session
        if (this.previousAttachArgs.platform === "android") {
            try {
                this.appLauncher.stopMonitoringLogCat();
            } catch (err) {
                logger.warn(localize("CouldNotStopMonitoringLogcat", "Couldn't stop monitoring logcat: {0}", err.message || err));
            }
        }

        super.disconnectRequest(response, args, request);
   }

    private initializeSettings(args: any): Q.Promise<any> {
        if (!this.isSettingsInitialized) {
            let chromeDebugCoreLogs = getLoggingDirectory();
            if (chromeDebugCoreLogs) {
                chromeDebugCoreLogs = path.join(chromeDebugCoreLogs, "ChromeDebugCoreLogs.txt");
            }
            let logLevel: string = args.trace;
            if (logLevel) {
                logLevel = logLevel.replace(logLevel[0], logLevel[0].toUpperCase());
                logger.setup(Logger.LogLevel[logLevel], chromeDebugCoreLogs || false);
                this.cdpProxyLogLevel = LogLevel[logLevel] === LogLevel.Verbose ? LogLevel.Info : LogLevel.None;
            } else {
                logger.setup(Logger.LogLevel.Log, chromeDebugCoreLogs || false);
                this.cdpProxyLogLevel = LogHelper.LOG_LEVEL === LogLevel.Trace ? LogLevel.Info : LogLevel.None;
            }

            if (!args.sourceMaps) {
                args.sourceMaps = true;
            }

            const projectRootPath = getProjectRoot(args);
            return ReactNativeProjectHelper.isReactNativeProject(projectRootPath)
                .then((result) => {
                    if (!result) {
                        throw ErrorHelper.getInternalError(InternalErrorCode.NotInReactNativeFolderError);
                    }
                    this.projectRootPath = projectRootPath;
                    this.appLauncher = AppLauncher.getAppLauncherByProjectRootPath(projectRootPath);
                    this.isSettingsInitialized = true;

                    return void 0;
                });
        } else {
            return Q.resolve<void>(void 0);
        }
    }
}

/**
 * Parses settings.json file for workspace root property
 */
export function getProjectRoot(args: any): string {
    const vsCodeRoot = args.cwd ? path.resolve(args.cwd) : path.resolve(args.program, "../..");
    const settingsPath = path.resolve(vsCodeRoot, ".vscode/settings.json");
    try {
        let settingsContent = fs.readFileSync(settingsPath, "utf8");
        settingsContent = stripJsonComments(settingsContent);
        let parsedSettings = JSON.parse(settingsContent);
        let projectRootPath = parsedSettings["react-native-tools.projectRoot"] || parsedSettings["react-native-tools"].projectRoot;
        return path.resolve(vsCodeRoot, projectRootPath);
    } catch (e) {
        logger.verbose(`${settingsPath} file doesn't exist or its content is incorrect. This file will be ignored.`);
        return args.cwd ? path.resolve(args.cwd) : path.resolve(args.program, "../..");
    }
}
