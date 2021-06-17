// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as glob from "glob";
import * as fs from "fs";
import * as semver from "semver";

import { Node } from "../../common/node/node";
import { ChildProcess } from "../../common/node/childProcess";
import { ErrorHelper } from "../../common/error/errorHelper";
import { InternalErrorCode } from "../../common/error/internalErrorCode";
import { ProjectVersionHelper } from "../../common/projectVersionHelper";
import { getFileNameWithoutExtension } from "../../common/utils";
import customRequire from "../../common/customRequire";
import { PlatformType } from "../launchArgs";
import { AppLauncher } from "../appLauncher";

export interface ConfigurationData {
    fullProductName: string;
    configurationFolder: string;
}

export interface IOSBuildLocationData {
    executable: string;
    configurationFolder: string;
}

export class PlistBuddy {
    private static plistBuddyExecutable = "/usr/libexec/PlistBuddy";

    private readonly TARGET_BUILD_DIR_SEARCH_KEY = "TARGET_BUILD_DIR";
    private readonly FULL_PRODUCT_NAME_SEARCH_KEY = "FULL_PRODUCT_NAME";

    private nodeChildProcess: ChildProcess;

    constructor({ nodeChildProcess = new Node.ChildProcess() } = {}) {
        this.nodeChildProcess = nodeChildProcess;
    }

    public getBundleId(
        platformProjectRoot: string,
        projectRoot: string,
        platform: PlatformType.iOS | PlatformType.macOS,
        simulator: boolean = true,
        configuration: string = "Debug",
        productName?: string,
        scheme?: string,
    ): Promise<string> {
        return this.getExecutableAndConfigurationFolder(
            platformProjectRoot,
            projectRoot,
            platform,
            simulator,
            configuration,
            productName,
            scheme,
        ).then((iOSBuildLocationData: IOSBuildLocationData) => {
            const infoPlistPath = path.join(
                iOSBuildLocationData.configurationFolder,
                iOSBuildLocationData.executable,
                platform === PlatformType.iOS ? "Info.plist" : path.join("Contents", "Info.plist"),
            );
            return this.invokePlistBuddy("Print:CFBundleIdentifier", infoPlistPath);
        });
    }

    public getExecutableAndConfigurationFolder(
        platformProjectRoot: string,
        projectRoot: string,
        platform: PlatformType.iOS | PlatformType.macOS,
        simulator: boolean = true,
        configuration: string = "Debug",
        productName?: string,
        scheme?: string,
    ): Promise<IOSBuildLocationData> {
        return ProjectVersionHelper.getReactNativeVersions(projectRoot).then(rnVersions => {
            let productsFolder;
            if (semver.gte(rnVersions.reactNativeVersion, "0.59.0")) {
                if (!scheme) {
                    // If no scheme were provided via runOptions.scheme or via runArguments then try to get scheme using the way RN CLI does.
                    scheme = this.getInferredScheme(
                        platformProjectRoot,
                        projectRoot,
                        rnVersions.reactNativeVersion,
                    );
                    if (platform === PlatformType.macOS) {
                        scheme = scheme + "-macOS";
                    }
                }
                productsFolder = path.join(
                    platformProjectRoot,
                    "build",
                    scheme,
                    "Build",
                    "Products",
                );
            } else {
                productsFolder = path.join(platformProjectRoot, "build", "Build", "Products");
            }

            let sdkType =
                platform === PlatformType.iOS ? this.getSdkType(simulator, scheme) : undefined;
            let configurationFolder = path.join(
                productsFolder,
                `${configuration}${sdkType ? `-${sdkType}` : ""}`,
            );
            let executable = "";
            if (productName) {
                executable = `${productName}.app`;
                if (!fs.existsSync(path.join(configurationFolder, executable))) {
                    const configurationData = this.getConfigurationData(
                        projectRoot,
                        rnVersions.reactNativeVersion,
                        platformProjectRoot,
                        configuration,
                        scheme,
                        configurationFolder,
                        sdkType,
                    );

                    configurationFolder = configurationData.configurationFolder;
                }
            } else {
                const executableList = this.findExecutable(configurationFolder);
                if (!executableList.length) {
                    const configurationData = this.getConfigurationData(
                        projectRoot,
                        rnVersions.reactNativeVersion,
                        platformProjectRoot,
                        configuration,
                        scheme,
                        configurationFolder,
                        sdkType,
                    );

                    configurationFolder = configurationData.configurationFolder;
                    executableList.push(configurationData.fullProductName);
                } else if (executableList.length > 1) {
                    throw ErrorHelper.getInternalError(
                        InternalErrorCode.IOSFoundMoreThanOneExecutablesCleanupBuildFolder,
                        configurationFolder,
                    );
                }
                executable = `${executableList[0]}`;
            }

            return {
                executable,
                configurationFolder,
            };
        });
    }

    public setPlistProperty(plistFile: string, property: string, value: string): Promise<void> {
        // Attempt to set the value, and if it fails due to the key not existing attempt to create the key
        return this.invokePlistBuddy(`Set ${property} ${value}`, plistFile)
            .catch(() => this.invokePlistBuddy(`Add ${property} string ${value}`, plistFile))
            .then(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    }

    public setPlistBooleanProperty(
        plistFile: string,
        property: string,
        value: boolean,
    ): Promise<void> {
        // Attempt to set the value, and if it fails due to the key not existing attempt to create the key
        return this.invokePlistBuddy(`Set ${property} ${value}`, plistFile)
            .catch(() => this.invokePlistBuddy(`Add ${property} bool ${value}`, plistFile))
            .then(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    }

    public deletePlistProperty(plistFile: string, property: string): Promise<void> {
        return this.invokePlistBuddy(`Delete ${property}`, plistFile)
            .catch(err => {
                if (!err.toString().toLowerCase().includes("does not exist")) {
                    throw err;
                }
            })
            .then(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    }

    public readPlistProperty(plistFile: string, property: string): Promise<string> {
        return this.invokePlistBuddy(`Print ${property}`, plistFile);
    }

    public getBuildPathAndProductName(
        platformProjectRoot: string,
        projectWorkspaceConfigName: string,
        configuration: string,
        scheme: string,
        sdkType?: string,
    ): ConfigurationData {
        const xcodebuildParams = ["-workspace", projectWorkspaceConfigName, "-scheme", scheme];
        if (sdkType) {
            xcodebuildParams.push("-sdk", sdkType);
        }
        xcodebuildParams.push("-configuration", configuration, "-showBuildSettings");

        const buildSettings = this.nodeChildProcess.execFileSync("xcodebuild", xcodebuildParams, {
            encoding: "utf8",
            cwd: platformProjectRoot,
        });

        const targetBuildDir = this.fetchParameterFromBuildSettings(
            <string>buildSettings,
            this.TARGET_BUILD_DIR_SEARCH_KEY,
        );
        const fullProductName = this.fetchParameterFromBuildSettings(
            <string>buildSettings,
            this.FULL_PRODUCT_NAME_SEARCH_KEY,
        );

        if (!targetBuildDir) {
            throw new Error("Failed to get the target build directory.");
        }
        if (!fullProductName) {
            throw new Error("Failed to get full product name.");
        }

        return {
            fullProductName,
            configurationFolder: targetBuildDir,
        };
    }

    public getInferredScheme(
        platformProjectRoot: string,
        projectRoot: string,
        rnVersion: string,
    ): string {
        const projectWorkspaceConfigName = this.getProjectWorkspaceConfigName(
            platformProjectRoot,
            projectRoot,
            rnVersion,
        );
        return getFileNameWithoutExtension(projectWorkspaceConfigName);
    }

    public getSdkType(simulator: boolean, scheme?: string): string {
        const sdkSuffix = simulator ? "simulator" : "os";
        const deviceType =
            (scheme?.toLowerCase().indexOf("tvos") ?? -1) > -1 ? "appletv" : "iphone";
        return `${deviceType}${sdkSuffix}`;
    }

    public getProjectWorkspaceConfigName(
        platformProjectRoot: string,
        projectRoot: string,
        rnVersion: string,
    ): string {
        // Portion of code was taken from https://github.com/react-native-community/cli/blob/master/packages/platform-ios/src/commands/runIOS/index.js
        // and modified a little bit
        /**
         * Copyright (c) Facebook, Inc. and its affiliates.
         *
         * This source code is licensed under the MIT license found in the
         * LICENSE file in the root directory of this source tree.
         *
         * @flow
         * @format
         */
        let iOSCliFolderName: string;
        if (semver.gte(rnVersion, "0.60.0")) {
            iOSCliFolderName = "cli-platform-ios";
        } else {
            iOSCliFolderName = "cli";
        }

        const findXcodeProject = customRequire(
            path.join(
                AppLauncher.getNodeModulesRootByProjectPath(projectRoot),
                `node_modules/@react-native-community/${iOSCliFolderName}/build/commands/runIOS/findXcodeProject`,
            ),
        ).default;
        const xcodeProject = findXcodeProject(fs.readdirSync(platformProjectRoot));
        if (!xcodeProject) {
            throw new Error(
                `Could not find Xcode project files in "${platformProjectRoot}" folder`,
            );
        }

        return xcodeProject.name;
    }

    public getConfigurationData(
        projectRoot: string,
        reactNativeVersion: string,
        platformProjectRoot: string,
        configuration: string,
        scheme: string | undefined,
        oldConfigurationFolder: string,
        sdkType?: string,
    ): ConfigurationData {
        if (!scheme) {
            throw ErrorHelper.getInternalError(
                InternalErrorCode.IOSCouldNotFoundExecutableInFolder,
                oldConfigurationFolder,
            );
        }
        const projectWorkspaceConfigName = this.getProjectWorkspaceConfigName(
            platformProjectRoot,
            projectRoot,
            reactNativeVersion,
        );
        return this.getBuildPathAndProductName(
            platformProjectRoot,
            projectWorkspaceConfigName,
            configuration,
            scheme,
            sdkType,
        );
    }

    /**
     * @param {string} buildSettings
     * @param {string} parameterName
     * @returns {string | null}
     */
    public fetchParameterFromBuildSettings(
        buildSettings: string,
        parameterName: string,
    ): string | null {
        const targetBuildMatch = new RegExp(`${parameterName} = (.+)$`, "m").exec(buildSettings);
        return targetBuildMatch && targetBuildMatch[1] ? targetBuildMatch[1].trim() : null;
    }

    private findExecutable(folder: string): string[] {
        return glob.sync("*.app", {
            cwd: folder,
        });
    }

    private invokePlistBuddy(command: string, plistFile: string): Promise<string> {
        return this.nodeChildProcess
            .exec(`${PlistBuddy.plistBuddyExecutable} -c '${command}' '${plistFile}'`)
            .then(res =>
                res.outcome.then((result: string) => {
                    return result.toString().trim();
                }),
            );
    }
}
