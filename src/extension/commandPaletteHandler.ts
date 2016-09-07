﻿// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Q from "q";
import {CommandExecutor} from "../common/commandExecutor";
import {SettingsHelper} from "./settingsHelper";
import {Log} from "../common/log/log";
import {Packager} from "../common/packager";
import {AndroidPlatform} from "../common/android/androidPlatform";
import {PackagerStatus, PackagerStatusIndicator} from "./packagerStatusIndicator";
import {ReactNativeProjectHelper} from "../common/reactNativeProjectHelper";
import {TargetPlatformHelper} from "../common/targetPlatformHelper";
import {TelemetryHelper} from "../common/telemetryHelper";
import {IOSDebugModeManager} from "../common/ios/iOSDebugModeManager";

export class CommandPaletteHandler {
    private reactNativePackager: Packager;
    private reactNativePackageStatusIndicator: PackagerStatusIndicator;
    private workspaceRoot: string;

    constructor(workspaceRoot: string, reactNativePackager: Packager, packagerStatusIndicator: PackagerStatusIndicator) {
        this.workspaceRoot = workspaceRoot;
        this.reactNativePackager = reactNativePackager;
        this.reactNativePackageStatusIndicator = packagerStatusIndicator;
    }

    /**
     * Starts the React Native packager
     */
    public startPackager(): Q.Promise<void> {
        return this.executeCommandInContext("startPackager", () =>
            this.runStartPackagerCommandAndUpdateStatus());
    }

    /**
     * Kills the React Native packager invoked by the extension's packager
     */
    public stopPackager(): Q.Promise<void> {
        return this.executeCommandInContext("stopPackager", () => this.reactNativePackager.stop())
            .then(() => this.reactNativePackageStatusIndicator.updatePackagerStatus(PackagerStatus.PACKAGER_STOPPED));
    }

    /**
     * Restarts the React Native packager
     */
    public restartPackager(): Q.Promise<void> {
        return this.executeCommandInContext("restartPackager", () =>
            this.runRestartPackagerCommandAndUpdateStatus());
    }

    /**
     * Executes the 'react-native run-android' command
     */
    public runAndroid(): Q.Promise<void> {
        TargetPlatformHelper.checkTargetPlatformSupport("android");
        return this.executeCommandInContext("runAndroid", () => this.executeWithPackagerRunning(() => {
            const packagerPort = SettingsHelper.getPackagerPort();
            return new AndroidPlatform({ projectRoot: this.workspaceRoot, packagerPort: packagerPort }).runApp(/*shouldLaunchInAllDevices*/true);
        }));
    }


    /**
     * Executes the 'react-native run-ios' command
     */
    public runIos(): Q.Promise<void> {
        TargetPlatformHelper.checkTargetPlatformSupport("ios");
        return this.executeCommandInContext("runIos", () => {
            // Set the Debugging setting to disabled, because in iOS it's persisted across runs of the app
            return new IOSDebugModeManager(this.workspaceRoot).setSimulatorJSDebuggingModeSetting(/*enable=*/ false)
                .catch(() => { }) // If setting the debugging mode fails, we ignore the error and we run the run ios command anyways
                .then(() => this.executeReactNativeRunCommand("run-ios"));
        });
    }

    private runStartPackagerCommandAndUpdateStatus(): Q.Promise<void> {
        return this.reactNativePackager.start(SettingsHelper.getPackagerPort(), false)
            .then(() => this.reactNativePackageStatusIndicator.updatePackagerStatus(PackagerStatus.PACKAGER_STARTED));
    }

    private runRestartPackagerCommandAndUpdateStatus(): Q.Promise<void> {
        return this.reactNativePackager.restart(SettingsHelper.getPackagerPort())
            .then(() => this.reactNativePackageStatusIndicator.updatePackagerStatus(PackagerStatus.PACKAGER_STARTED));
    }

    /**
     * Executes a react-native command passed after starting the packager
     * {command} The command to be executed
     * {args} The arguments to be passed to the command
     */
    private executeReactNativeRunCommand(command: string, args?: string[]): Q.Promise<void> {
        return this.executeWithPackagerRunning(() => {
            return new CommandExecutor(this.workspaceRoot).spawnReactCommand(command, args).outcome;
        });
    }

    /**
     * Executes a lambda function after starting the packager
     * {lambda} The lambda function to be executed
     */
    private executeWithPackagerRunning(lambda: () => Q.Promise<void>): Q.Promise<void> {
        // Start the packager before executing the React-Native command
        Log.logMessage("Attempting to start the React Native packager");
        return this.runStartPackagerCommandAndUpdateStatus().then(lambda);
    }

    /**
     * Ensures that we are in a React Native project and then executes the operation
     * Otherwise, displays an error message banner
     * {operation} - a function that performs the expected operation
     */
    private executeCommandInContext(rnCommand: string, operation: () => Q.Promise<void> | void): Q.Promise<void> {
        let reactNativeProjectHelper = new ReactNativeProjectHelper(vscode.workspace.rootPath);
        return TelemetryHelper.generate("RNCommand", (generator) => {
            generator.add("command", rnCommand, false);
            return reactNativeProjectHelper.isReactNativeProject().then(isRNProject => {
                generator.add("isRNProject", isRNProject, false);
                if (isRNProject) {
                    // Bring the log channel to focus
                    Log.setFocusOnLogChannel();

                    // Execute the operation
                    return operation();
                } else {
                    vscode.window.showErrorMessage("Current workspace is not a React Native project.");
                }
            });
        });
    }
}
