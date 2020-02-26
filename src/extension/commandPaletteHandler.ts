﻿// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Q from "q";
import * as XDL from "./exponent/xdlInterface";
import {SettingsHelper} from "./settingsHelper";
import {OutputChannelLogger} from "./log/OutputChannelLogger";
import {TargetType, GeneralMobilePlatform} from "./generalMobilePlatform";
import {AndroidPlatform} from "./android/androidPlatform";
import {IOSPlatform} from "./ios/iOSPlatform";
import {ProjectVersionHelper} from "../common/projectVersionHelper";
import {ReactNativeProjectHelper} from "../common/reactNativeProjectHelper";
import {TargetPlatformHelper} from "../common/targetPlatformHelper";
import {TelemetryHelper} from "../common/telemetryHelper";
import {ProjectsStorage} from "./projectsStorage";
import {IAndroidRunOptions, IIOSRunOptions} from "./launchArgs";
import {ExponentPlatform} from "./exponent/exponentPlatform";
import {spawn, ChildProcess} from "child_process";
import {HostPlatform} from "../common/hostPlatform";
import {CommandExecutor} from "../common/commandExecutor";
import * as nls from "vscode-nls";
import {ErrorHelper} from "../common/error/errorHelper";
import {InternalErrorCode} from "../common/error/internalErrorCode";
import {AppLauncher} from "./appLauncher";
const localize = nls.loadMessageBundle();

export class CommandPaletteHandler {
    public static elementInspector: ChildProcess | null;
    private static logger: OutputChannelLogger = OutputChannelLogger.getMainChannel();

    /**
     * Starts the React Native packager
     */
    public static startPackager(): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                return ProjectVersionHelper.getReactNativePackageVersionsFromNodeModules(appLauncher.getPackager().getProjectPath())
                    .then(versions => {
                        return this.executeCommandInContext("startPackager", appLauncher.getWorkspaceFolder(), () => {
                            return appLauncher.getPackager().isRunning()
                                .then((running) => {
                                    return running ? appLauncher.getPackager().stop() : Q.resolve(void 0);
                                });
                        })
                        .then(() => appLauncher.getPackager().start());
                    });
            });
    }

    /**
     * Kills the React Native packager invoked by the extension's packager
     */
    public static stopPackager(): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                return this.executeCommandInContext("stopPackager", appLauncher.getWorkspaceFolder(), () => appLauncher.getPackager().stop());
            });
    }

    public static stopAllPackagers(): Q.Promise<void> {
        let keys = Object.keys(ProjectsStorage.projectsCache);
        let promises: Q.Promise<void>[] = [];
        keys.forEach((key) => {
            let appLauncher = ProjectsStorage.projectsCache[key];
            promises.push(this.executeCommandInContext("stopPackager", appLauncher.getWorkspaceFolder(), () => appLauncher.getPackager().stop()));
        });

        return Q.all(promises).then(() => {});
    }

    /**
     * Restarts the React Native packager
     */
    public static restartPackager(): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                return ProjectVersionHelper.getReactNativePackageVersionsFromNodeModules(appLauncher.getPackager().getProjectPath())
                    .then(versions => {
                        return this.executeCommandInContext("restartPackager", appLauncher.getWorkspaceFolder(), () =>
                            this.runRestartPackagerCommandAndUpdateStatus(appLauncher));
                    });
            });
    }

    /**
     * Execute command to publish to exponent host.
     */
    public static publishToExpHost(): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                return this.executeCommandInContext("publishToExpHost", appLauncher.getWorkspaceFolder(), () => {
                    return this.executePublishToExpHost(appLauncher).then((didPublish) => {
                        if (!didPublish) {
                            CommandPaletteHandler.logger.warning(localize("ExponentPublishingWasUnsuccessfulMakeSureYoureLoggedInToExpo", "Publishing was unsuccessful. Please make sure you are logged in Expo and your project is a valid Expo project"));
                        }
                    });
                });
            });
    }

    /**
     * Executes the 'react-native run-android' command
     */
    public static runAndroid(target: TargetType = "simulator"): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                TargetPlatformHelper.checkTargetPlatformSupport("android");
                return ProjectVersionHelper.getReactNativePackageVersionsFromNodeModules(appLauncher.getPackager().getProjectPath())
                    .then(versions => {
                        appLauncher.setReactNativeVersions(versions);
                        return this.executeCommandInContext("runAndroid", appLauncher.getWorkspaceFolder(), () => {
                            const platform = <AndroidPlatform>this.createPlatform(appLauncher, "android", AndroidPlatform, target);
                            return platform.beforeStartPackager()
                                .then(() => {
                                    return platform.startPackager();
                                })
                                .then(() => {
                                    return platform.runApp(/*shouldLaunchInAllDevices*/true);
                                })
                                .then(() => {
                                    return platform.disableJSDebuggingMode();
                                });
                        });
                    });
            });
    }

    /**
     * Executes the 'react-native run-ios' command
     */
    public static runIos(target: TargetType = "simulator"): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                return ProjectVersionHelper.getReactNativePackageVersionsFromNodeModules(appLauncher.getPackager().getProjectPath())
                    .then(versions => {
                        appLauncher.setReactNativeVersions(versions);
                        TargetPlatformHelper.checkTargetPlatformSupport("ios");
                        return this.executeCommandInContext("runIos", appLauncher.getWorkspaceFolder(), () => {
                            const platform = <IOSPlatform>this.createPlatform(appLauncher, "ios", IOSPlatform, target);
                            return platform.beforeStartPackager()
                                .then(() => {
                                    return platform.startPackager();
                                })
                                .then(() => {
                                    // Set the Debugging setting to disabled, because in iOS it's persisted across runs of the app
                                    return platform.disableJSDebuggingMode();
                                })
                                .catch(() => { }) // If setting the debugging mode fails, we ignore the error and we run the run ios command anyways
                                .then(() => {
                                    return platform.runApp();
                                });
                        });
                    });
            });
    }

    /**
     * Starts the Exponent packager
     */
    public static runExponent(): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                return ProjectVersionHelper.getReactNativePackageVersionsFromNodeModules(appLauncher.getPackager().getProjectPath())
                    .then(versions => {
                        return this.loginToExponent(appLauncher)
                            .then(() => {
                                return this.executeCommandInContext("runExponent", appLauncher.getWorkspaceFolder(), () => {
                                    appLauncher.setReactNativeVersions(versions);
                                    const platform = <ExponentPlatform>this.createPlatform(appLauncher, "exponent", ExponentPlatform);
                                    return platform.beforeStartPackager()
                                        .then(() => {
                                            return platform.startPackager();
                                        })
                                        .then(() => {
                                            return platform.runApp();
                                        });
                                });
                            });
                    });
            });
    }

    public static showDevMenu(): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                const androidPlatform = <AndroidPlatform>this.createPlatform(appLauncher, "android", AndroidPlatform);
                androidPlatform.showDevMenu()
                    .catch(() => { }); // Ignore any errors

                if (process.platform === "darwin") {
                    const iosPlatform = <IOSPlatform>this.createPlatform(appLauncher, "ios", IOSPlatform);
                    iosPlatform.showDevMenu()
                        .catch(() => { }); // Ignore any errors
                }
                return Q.resolve(void 0);
            });
    }

    public static reloadApp(): Q.Promise<void> {
        return this.selectProject()
            .then((appLauncher: AppLauncher) => {
                const androidPlatform = <AndroidPlatform>this.createPlatform(appLauncher, "android", AndroidPlatform);
                androidPlatform.reloadApp()
                    .catch(() => { }); // Ignore any errors

                if (process.platform === "darwin") {
                    const iosPlatform = <IOSPlatform>this.createPlatform(appLauncher, "ios", IOSPlatform);
                    iosPlatform.reloadApp()
                        .catch(() => { }); // Ignore any errors
                }
                return Q.resolve(void 0);
            });
    }

    public static runElementInspector(): Q.Promise<void> {
        if (!CommandPaletteHandler.elementInspector) {
            // Remove the following env variables to prevent running electron app in node mode.
            // https://github.com/Microsoft/vscode/issues/3011#issuecomment-184577502
            let env = Object.assign({}, process.env);
            delete env.ATOM_SHELL_INTERNAL_RUN_AS_NODE;
            delete env.ELECTRON_RUN_AS_NODE;
            let command = HostPlatform.getNpmCliCommand("react-devtools");
            CommandPaletteHandler.elementInspector = spawn(command, [], {
                env,
            });
            if (!CommandPaletteHandler.elementInspector.pid) {
                CommandPaletteHandler.elementInspector = null;
                return Q.reject(ErrorHelper.getInternalError(InternalErrorCode.ReactDevtoolsIsNotInstalled));
            }
            CommandPaletteHandler.elementInspector.stdout.on("data", (data: string) => {
                this.logger.info(data);
            });
            CommandPaletteHandler.elementInspector.stderr.on("data", (data: string) => {
                this.logger.error(data);
            });
            CommandPaletteHandler.elementInspector.once("exit", () => {
                CommandPaletteHandler.elementInspector = null;
            });
        } else {
            this.logger.info(localize("AnotherElementInspectorAlreadyRun", "Another element inspector already run"));
        }
        return Q(void 0);
    }

    public static stopElementInspector(): void {
        return CommandPaletteHandler.elementInspector ? CommandPaletteHandler.elementInspector.kill() : void 0;
    }

    public static getPlatformByCommandName(commandName: string): string {
        commandName = commandName.toLocaleLowerCase();

        if (commandName.indexOf("android") > -1) {
            return "android";
        }

        if (commandName.indexOf("ios") > -1) {
            return "ios";
        }

        if (commandName.indexOf("exponent") > -1) {
            return "exponent";
        }

        return "";
    }

    private static createPlatform(appLauncher: AppLauncher, platform: "ios" | "android" | "exponent", platformClass: typeof GeneralMobilePlatform, target?: TargetType): GeneralMobilePlatform {
        const runOptions = CommandPaletteHandler.getRunOptions(appLauncher, platform, target);
        return new platformClass(runOptions, {
            packager: appLauncher.getPackager(),
        });
    }

    private static runRestartPackagerCommandAndUpdateStatus(appLauncher: AppLauncher): Q.Promise<void> {
        return appLauncher.getPackager().restart(SettingsHelper.getPackagerPort(appLauncher.getWorkspaceFolderUri().fsPath));
    }

    /**
     * Ensures that we are in a React Native project and then executes the operation
     * Otherwise, displays an error message banner
     * {operation} - a function that performs the expected operation
     */
    private static executeCommandInContext(rnCommand: string, workspaceFolder: vscode.WorkspaceFolder, operation: () => Q.Promise<void>): Q.Promise<void> {
        const extProps = {
            platform: {
                value: CommandPaletteHandler.getPlatformByCommandName(rnCommand),
                isPii: false,
            },
        };

        return TelemetryHelper.generate("RNCommand", extProps, (generator) => {
            generator.add("command", rnCommand, false);
            const projectRoot = SettingsHelper.getReactNativeProjectRoot(workspaceFolder.uri.fsPath);
            this.logger.debug(`Command palette: run project ${projectRoot} in context`);
            return ReactNativeProjectHelper.isReactNativeProject(projectRoot)
                .then(isRNProject => {
                    generator.add("isRNProject", isRNProject, false);
                    if (isRNProject) {
                        // Bring the log channel to focus
                        this.logger.setFocusOnLogChannel();

                        // Execute the operation
                        return operation();
                    } else {
                        vscode.window.showErrorMessage(`${projectRoot} workspace is not a React Native project.`);
                        return;
                    }
                });
        });
    }

    /**
     * Publish project to exponent server. In order to do this we need to make sure the user is logged in exponent and the packager is running.
     */
    private static executePublishToExpHost(appLauncher: AppLauncher): Q.Promise<boolean> {
        CommandPaletteHandler.logger.info(localize("PublishingAppToExponentServer", "Publishing app to Expo server. This might take a moment."));
        return this.loginToExponent(appLauncher)
            .then(user => {
                CommandPaletteHandler.logger.debug(`Publishing as ${user.username}...`);
                return this.runExponent()
                    .then(() =>
                        XDL.publish(appLauncher.getWorkspaceFolderUri().fsPath))
                    .then(response => {
                        if (response.err || !response.url) {
                            return false;
                        }
                        const publishedOutput = localize("ExpoAppSuccessfullyPublishedTo", "Expo app successfully published to {0}", response.url);
                        CommandPaletteHandler.logger.info(publishedOutput);
                        vscode.window.showInformationMessage(publishedOutput);
                        return true;
                    });
            });
    }

    private static loginToExponent(appLauncher: AppLauncher): Q.Promise<XDL.IUser> {
        return appLauncher.getExponentHelper().loginToExponent(
            (message, password) => {
                return Q.Promise((resolve, reject) => {
                    vscode.window.showInputBox({ placeHolder: message, password: password })
                        .then(login => {
                            resolve(login || "");
                        }, reject);
                });
            },
            (message) => {
                return Q.Promise((resolve, reject) => {
                    vscode.window.showInformationMessage(message)
                        .then(password => {
                            resolve(password || "");
                        }, reject);
                });
            }
        )
        .catch((err) => {
            CommandPaletteHandler.logger.warning(localize("ExpoErrorOccuredMakeSureYouAreLoggedIn", "An error has occured. Please make sure you are logged in to Expo, your project is setup correctly for publishing and your packager is running as Expo."));
            throw err;
        });
    }

    private static selectProject(): Q.Promise<AppLauncher> {
        let keys = Object.keys(ProjectsStorage.projectsCache);
        if (keys.length > 1) {
            return Q.Promise((resolve, reject) => {
                vscode.window.showQuickPick(keys)
                    .then((selected) => {
                        if (selected) {
                            this.logger.debug(`Command palette: selected project ${selected}`);
                            resolve(ProjectsStorage.projectsCache[selected]);
                        }
                    }, reject);
            });
        } else if (keys.length === 1) {
            this.logger.debug(`Command palette: once project ${keys[0]}`);
            return Q.resolve(ProjectsStorage.projectsCache[keys[0]]);
        } else {
            return Q.reject(ErrorHelper.getInternalError(InternalErrorCode.WorkspaceNotFound, "Current workspace does not contain React Native projects."));
        }
    }

    private static getRunOptions(appLauncher: AppLauncher, platform: "ios" | "android" | "exponent", target: TargetType = "simulator"): IAndroidRunOptions | IIOSRunOptions {
        const packagerPort = SettingsHelper.getPackagerPort(appLauncher.getWorkspaceFolderUri().fsPath);
        const runArgs = SettingsHelper.getRunArgs(platform, target, appLauncher.getWorkspaceFolderUri());
        const envArgs = SettingsHelper.getEnvArgs(platform, target, appLauncher.getWorkspaceFolderUri());
        const envFile = SettingsHelper.getEnvFile(platform, target, appLauncher.getWorkspaceFolderUri());
        const projectRoot = SettingsHelper.getReactNativeProjectRoot(appLauncher.getWorkspaceFolderUri().fsPath);
        const runOptions: IAndroidRunOptions | IIOSRunOptions = {
            platform: platform,
            workspaceRoot: appLauncher.getWorkspaceFolderUri().fsPath,
            projectRoot: projectRoot,
            packagerPort: packagerPort,
            runArguments: runArgs,
            env: envArgs,
            envFile: envFile,
            reactNativeVersions: appLauncher.getReactNativeVersions() || {reactNativeVersion: "", reactNativeWindowsVersion: ""},
        };

        CommandExecutor.ReactNativeCommand = SettingsHelper.getReactNativeGlobalCommandName(appLauncher.getWorkspaceFolderUri());

        return runOptions;
    }
}
