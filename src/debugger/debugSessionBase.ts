// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as vscode from "vscode";
import * as Q from "q";
import * as path from "path";
import * as fs from "fs";
import stripJsonComments = require("strip-json-comments");
import { LoggingDebugSession, Logger, logger } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { getLoggingDirectory, LogHelper } from "../extension/log/LogHelper";
import { ReactNativeProjectHelper } from "../common/reactNativeProjectHelper";
import { ErrorHelper } from "../common/error/errorHelper";
import { InternalErrorCode } from "../common/error/internalErrorCode";
import { ILaunchArgs } from "../extension/launchArgs";
import { AppLauncher } from "../extension/appLauncher";
import { MultipleLifetimesAppWorker } from "./appWorker";
import { LogLevel } from "../extension/log/LogHelper";

/**
 * Enum of possible statuses of debug session
 */
export enum DebugSessionStatus {
    /** A session has been just created */
    FirstConnection,
    /** This status is required in order to exclude the possible creation of several debug sessions at the first start */
    FirstConnectionPending,
    /** This status means that an application can be reloaded */
    ConnectionAllowed,
    /** This status means that an application is reloading now, and we shouldn't terminate the current debug session */
    ConnectionPending,
    /** A debuggee connected successfully */
    ConnectionDone,
    /** A debuggee failed to connect */
    ConnectionFailed,
}

export interface IAttachRequestArgs extends DebugProtocol.AttachRequestArguments, ILaunchArgs {
    cwd: string; /* Automatically set by VS Code to the currently opened folder */
    port: number;
    url?: string;
    address?: string;
    trace?: string;
}

export interface ILaunchRequestArgs extends DebugProtocol.LaunchRequestArguments, IAttachRequestArgs { }

export abstract class DebugSessionBase extends LoggingDebugSession {

    protected appLauncher: AppLauncher;
    protected appWorker: MultipleLifetimesAppWorker | null;
    protected projectRootPath: string;
    protected isSettingsInitialized: boolean; // used to prevent parameters reinitialization when attach is called from launch function
    protected previousAttachArgs: IAttachRequestArgs;
    protected cdpProxyLogLevel: LogLevel;
    protected debugSessionStatus: DebugSessionStatus;
    protected session: vscode.DebugSession;

    constructor(session: vscode.DebugSession) {
        super();

        this.session = session;
        this.isSettingsInitialized = false;
        this.appWorker = null;
        this.debugSessionStatus = DebugSessionStatus.FirstConnection;
    }

    protected initializeSettings(args: any): Q.Promise<any> {
        if (!this.isSettingsInitialized) {
            let chromeDebugCoreLogs = getLoggingDirectory();
            if (chromeDebugCoreLogs) {
                chromeDebugCoreLogs = path.join(chromeDebugCoreLogs, "DebugSessionLogs.txt");
            }
            let logLevel: string = args.trace;
            if (logLevel) {
                logLevel = logLevel.replace(logLevel[0], logLevel[0].toUpperCase());
                logger.setup(Logger.LogLevel[logLevel], chromeDebugCoreLogs || false);
                this.cdpProxyLogLevel = LogLevel[logLevel] === LogLevel.Verbose ? LogLevel.Custom : LogLevel.None;
            } else {
                logger.setup(Logger.LogLevel.Log, chromeDebugCoreLogs || false);
                this.cdpProxyLogLevel = LogHelper.LOG_LEVEL === LogLevel.Trace ? LogLevel.Custom : LogLevel.None;
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
