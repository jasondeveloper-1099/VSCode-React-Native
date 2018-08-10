// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as Q from "q";
import * as semver from "semver";
import * as path from "path";

import {MobilePlatformDeps} from "../generalMobilePlatform";
import {IWindowsRunOptions} from "../launchArgs";
import {TelemetryHelper} from "../../common/telemetryHelper";
import {CommandExecutor} from "../../common/commandExecutor";
import {ReactNativeProjectHelper} from "../../common/reactNativeProjectHelper";
import {WindowsPlatform} from "./windowsPlatform";

/**
 * WPF specific platform implementation for debugging RN applications.
 */
export class WpfPlatform extends WindowsPlatform {
    private static WPF_SUPPORTED = "0.55.0";
    constructor(protected runOptions: IWindowsRunOptions, platformDeps: MobilePlatformDeps = {}) {
        super(runOptions, platformDeps);
    }

    public runApp(enableDebug: boolean = true): Q.Promise<void> {
        const extProps = {
            platform: {
                value: "wpf",
                isPii: false,
            },
        };

        return TelemetryHelper.generate("WpfPlatform.runApp", extProps, () => {
            const env = this.getEnvArgument();

            if (enableDebug) {
                this.runArguments.push("--proxy");
            }

            return ReactNativeProjectHelper.getReactNativeVersion(this.runOptions.projectRoot)
                .then(version => {
                    if (!semver.gt(version, WpfPlatform.WPF_SUPPORTED)) {
                        throw new Error(`Debugging WPF platform is not supported for this react-native-windows version(${version})`);
                    }

                    if (!semver.valid(version) /*Custom RN implementations should support this flag*/ || semver.gte(version, WpfPlatform.NO_PACKAGER_VERSION)) {
                        this.runArguments.push("--no-packager");
                    }

                    const exec = new CommandExecutor(this.projectPath, this.logger);
                    return Q.Promise((resolve, reject) => {
                        const appName = this.projectPath.split(path.sep).pop();
                        // Killing another instances of the app which were run earlier
                        return exec.execute(`cmd /C Taskkill /IM ${appName}.exe /F`)
                            .finally(() => {
                                const runWpfSpawn = exec.spawnReactCommand(`run-${this.platformName}`, this.runArguments, {env});
                                let resolved = false;
                                let output = "";
                                runWpfSpawn.stdout.on("data", (data: Buffer) => {
                                    output += data.toString();
                                    if (!resolved && output.indexOf("Starting the app") > -1) {
                                        resolved = true;
                                        resolve(void 0);
                                    }
                                });

                                runWpfSpawn.stderr.on("data", (error: Buffer) => {
                                    if (error.toString().trim()) {
                                        reject(error.toString());
                                    }
                                });

                                runWpfSpawn.outcome.then(() => {
                                    reject(void 0); // If WPF process ended then app run fault
                                });
                            });
                    });
                });
        });
    }
}
