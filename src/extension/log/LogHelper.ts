// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

/**
 * Logging utility class.
 */
import * as path from "path";
import * as mkdirp from "mkdirp";
export enum LogLevel {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warning = 3,
    Error = 4,
    None = 5,
}

export interface ILogger {
    log: (message: string, level: LogLevel) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
    error: (errorMessage: string, error?: Error, stack?: boolean) => void;
    debug: (message: string) => void;
    logStream: (data: Buffer | String, stream?: NodeJS.WritableStream) => void;
}

export class LogHelper {
    public static get LOG_LEVEL(): LogLevel {
        return getLogLevel();
    }
}

export interface DevLogToFileSettings {
    LogsDirectory: string | undefined;
}

export function getLoggingOptions(): DevLogToFileSettings {
    return {
        LogsDirectory: process.env.REACT_NATIVE_TOOLS_LOGS_DIR,
    };
}
/**
 * Returns directory in which the extension's log files will be saved
 * if `env` variables `REACT_NATIVE_TOOLS_LOGS_DIR` is defined.
 * Also, checks that path is a correct absolute path. Creates new folder if not exists yet.
 * @returns Path to the logs folder or null
 */
export function getLoggingDirectory(): string | null {
    const loggingOptions = getLoggingOptions();
    if (loggingOptions.LogsDirectory) {
        let dirPath = loggingOptions.LogsDirectory;
        if (!path.isAbsolute(dirPath)) {
            return null;
        }
        mkdirp.sync(dirPath);
        return dirPath;
    }
    return null;
}

function getLogLevel() {
    try {
        const SettingsHelper = require("../settingsHelper").SettingsHelper;
        return SettingsHelper.getLogLevel();
    } catch (err) { // Debugger context
        return LogLevel.Info; // Default
    }
}
