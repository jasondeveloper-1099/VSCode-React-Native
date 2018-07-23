// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

/// <reference path="exponentHelper.d.ts" />

import * as path from "path";
import * as Q from "q";
import * as XDL from "./xdlInterface";
import { Package } from "../../common/node/package";
import { ReactNativeProjectHelper } from "../../common/reactNativeProjectHelper";
import { FileSystem } from "../../common/node/fileSystem";
import {OutputChannelLogger} from "../log/OutputChannelLogger";
import stripJSONComments = require("strip-json-comments");

const APP_JSON = "app.json";
const EXP_JSON = "exp.json";

const EXPONENT_INDEX = "exponentIndex.js";
const DEFAULT_EXPONENT_INDEX = "index.js";
const DEFAULT_IOS_INDEX = "index.ios.js";
const DEFAULT_ANDROID_INDEX = "index.android.js";

const DBL_SLASHES = /\\/g;

export class ExponentHelper {
    private workspaceRootPath: string;
    private projectRootPath: string;
    private fs: FileSystem = new FileSystem();
    private hasInitialized: boolean;
    private logger: OutputChannelLogger = OutputChannelLogger.getMainChannel();

    public constructor(workspaceRootPath: string, projectRootPath: string) {
        this.workspaceRootPath = workspaceRootPath;
        this.projectRootPath = projectRootPath;
        this.hasInitialized = false;
        // Constructor is slim by design. This is to add as less computation as possible
        // to the initialization of the extension. If a public method is added, make sure
        // to call this.lazilyInitialize() at the begining of the code to be sure all variables
        // are correctly initialized.
    }

    public configureExponentEnvironment(): Q.Promise<void> {
        this.lazilyInitialize();
        this.logger.info("Making sure your project uses the correct dependencies for exponent. This may take a while...");
        this.logger.logStream("Checking if this is Expo app.");
        return this.isExpoApp(true)
            .then(isExpo => {
                this.logger.logStream(".\n");

                return this.patchAppJson(isExpo);
            });
    }

    /**
     * Returns the current user. If there is none, asks user for username and password and logins to exponent servers.
     */
    public loginToExponent(
        promptForInformation: (message: string, password: boolean) => Q.Promise<string>,
        showMessage: (message: string) => Q.Promise<string>
    ): Q.Promise<XDL.IUser> {
        this.lazilyInitialize();
        return XDL.currentUser()
            .then((user) => {
                if (!user) {
                    let username = "";
                    return showMessage("You need to login to exponent. Please provide username and password to login. If you don't have an account we will create one for you.")
                        .then(() =>
                            promptForInformation("Exponent username", false)
                        ).then((name: string) => {
                            username = name;
                            return promptForInformation("Exponent password", true);
                        })
                        .then((password: string) =>
                            XDL.login(username, password));
                }
                return user;
            })
            .catch(error => {
                return Q.reject<XDL.IUser>(error);
            });
    }

    public getExpPackagerOptions(): Q.Promise<ExpConfigPackager> {
        this.lazilyInitialize();
        return this.getFromExpConfig("packagerOpts")
            .then(opts => opts || {});
    }

    public isExpoApp(showProgress: boolean = false): Q.Promise<boolean> {
        if (showProgress) {
            this.logger.logStream("...");
        }

        const packageJsonPath = this.pathToFileInWorkspace("package.json");
        return this.fs.readFile(packageJsonPath)
            .then(content => {
                const packageJson = JSON.parse(content);
                const isExp = packageJson.dependencies && !!packageJson.dependencies.expo || false;
                if (showProgress) this.logger.logStream(".");
                return isExp;
            }).catch(() => {
                if (showProgress) {
                    this.logger.logStream(".");
                }
                // Not in a react-native project
                return false;
            });
    }

    /**
     * Path to a given file inside the .vscode directory
     */
    private dotvscodePath(filename: string): string {
        return path.join(this.workspaceRootPath, ".vscode", filename);
    }

    private createExpoEntry(name: string): Q.Promise<void> {
        this.lazilyInitialize();
        return this.detectEntry()
            .then((entryPoint: string) => {
                const content = this.generateFileContent(name, entryPoint);
                return this.fs.writeFile(this.dotvscodePath(EXPONENT_INDEX), content);
            });

    }

    private detectEntry(): Q.Promise<string> {
        this.lazilyInitialize();
        return Q.all([
            this.fs.exists(this.pathToFileInWorkspace(DEFAULT_EXPONENT_INDEX)),
            this.fs.exists(this.pathToFileInWorkspace(DEFAULT_IOS_INDEX)),
            this.fs.exists(this.pathToFileInWorkspace(DEFAULT_ANDROID_INDEX)),
        ])
        .spread((expo: boolean, ios: boolean): string => {
            return expo ? this.pathToFileInWorkspace(DEFAULT_EXPONENT_INDEX) :
                ios ? this.pathToFileInWorkspace(DEFAULT_IOS_INDEX) :
                this.pathToFileInWorkspace(DEFAULT_ANDROID_INDEX);
        });
    }

    private generateFileContent(name: string, entryPoint: string): string {
        return `// This file is automatically generated by VS Code
// Please do not modify it manually. All changes will be lost.
var React = require('${this.pathToFileInWorkspace("/node_modules/react")}');
var { Component } = React;
var ReactNative = require('${this.pathToFileInWorkspace("/node_modules/react-native")}');
var { AppRegistry } = ReactNative;
var entryPoint = require('${entryPoint}');
AppRegistry.registerRunnable('main', function(appParameters) {
    AppRegistry.runApplication('${name}', appParameters);
});`;
    }

    private patchAppJson(isExpo: boolean = true): Q.Promise<void> {
        return this.readAppJson()
            .catch(() => {
                // if app.json doesn't exist but it's ok, we will create it
                return {};
            })
            .then((config: AppJson) => {
                let expoConfig = <ExpConfig>(config.expo || {});
                if (!expoConfig.name || !expoConfig.slug) {
                    return this.getPackageName()
                        .then((name: string) => {
                            expoConfig.slug = expoConfig.slug || config.name || name.replace(" ", "-");
                            expoConfig.name = expoConfig.name || config.name || name;
                            config.expo = expoConfig;
                            return config;
                        });
                }

                return config;
            })
            .then((config: AppJson) => {
                if (!config.expo.sdkVersion) {
                    return this.exponentSdk(true)
                        .then(sdkVersion => {
                            config.expo.sdkVersion = sdkVersion;
                            return config;
                        });
                }
                return config;
            })
            .then((config: AppJson) => {
                if (!isExpo) {
                    config.expo.entryPoint = this.dotvscodePath(EXPONENT_INDEX);
                }

                return config;
            })
            .then((config: AppJson) => {
                return config ? this.writeAppJson(config) : config;
            })
            .then((config: AppJson) => {
                return isExpo ? Q.resolve(void 0) : this.createExpoEntry(config.expo.name);
            });
    }

    /**
     * Exponent sdk version that maps to the current react-native version
     * If react native version is not supported it returns null.
     */
    private exponentSdk(showProgress: boolean = false): Q.Promise<string> {
        if (showProgress) {
            this.logger.logStream("...");
        }

        return ReactNativeProjectHelper.getReactNativeVersion(this.projectRootPath)
            .then(version => {
                if (showProgress) this.logger.logStream(".");
                return XDL.mapVersion(version)
                    .then(sdkVersion => {
                        if (!sdkVersion) {
                            return XDL.supportedVersions()
                                .then((versions) => {
                                    return Q.reject<string>(new Error(`React Native version not supported by exponent. Major versions supported: ${versions.join(", ")}`));
                                });
                        }
                        return sdkVersion;
                    });
            });
    }


    /**
     * Name specified on user's package.json
     */
    private getPackageName(): Q.Promise<string> {
        return new Package(this.projectRootPath, { fileSystem: this.fs }).name();
    }

    private getExpConfig(): Q.Promise<ExpConfig> {
        return this.readExpJson()
            .catch(err => {
                if (err.code === "ENOENT") {
                    return this.readAppJson()
                        .then((config: AppJson) => {
                            return config.expo || {};
                        });
                }

                return err;
            });
    }

    private getFromExpConfig(key: string): Q.Promise<any> {
        return this.getExpConfig()
            .then((config: ExpConfig) => config[key]);
    }

    /**
     * Returns the specified setting from exp.json if it exists
     */
    private readExpJson(): Q.Promise<ExpConfig> {
        const expJsonPath = this.pathToFileInWorkspace(EXP_JSON);
        return this.fs.readFile(expJsonPath)
            .then(content => {
                return JSON.parse(stripJSONComments(content));
            });
    }

    private readAppJson(): Q.Promise<AppJson> {
        const appJsonPath = this.pathToFileInWorkspace(APP_JSON);
        return this.fs.readFile(appJsonPath)
            .then(content => {
                return JSON.parse(stripJSONComments(content));
            });
    }

    private writeAppJson(config: AppJson): Q.Promise<AppJson> {
        const appJsonPath = this.pathToFileInWorkspace(APP_JSON);
        return this.fs.writeFile(appJsonPath, JSON.stringify(config, null, 2))
            .then(() => config);
    }

    /**
     * Path to a given file from the workspace root
     */
    private pathToFileInWorkspace(filename: string): string {
        return path.join(this.projectRootPath, filename).replace(DBL_SLASHES, "/");
    }

    /**
     * Works as a constructor but only initiliazes when it's actually needed.
     */
    private lazilyInitialize(): void {
        if (!this.hasInitialized) {
            this.hasInitialized = true;

            XDL.configReactNativeVersionWargnings();
            XDL.attachLoggerStream(this.projectRootPath, {
                stream: {
                    write: (chunk: any) => {
                        if (chunk.level <= 30) {
                            this.logger.logStream(chunk.msg);
                        } else if (chunk.level === 40) {
                            this.logger.warning(chunk.msg);
                        } else {
                            this.logger.error(chunk.msg);
                        }
                    },
                },
                type: "raw",
            });
        }
    }
}
