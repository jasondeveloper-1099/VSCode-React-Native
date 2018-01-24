// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as Q from "q";

import {GeneralMobilePlatform, MobilePlatformDeps } from "../generalMobilePlatform";
import {IWindowsRunOptions} from "../launchArgs";
import {OutputVerifier, PatternToFailure} from "../../common/outputVerifier";
import {TelemetryHelper} from "../../common/telemetryHelper";
import {CommandExecutor} from "../../common/commandExecutor";
import {ReactNativeProjectHelper} from "../../common/reactNativeProjectHelper";

/**
 * Windows specific platform implementation for debugging RN applications.
 */
export class WindowsPlatform extends GeneralMobilePlatform {

    private static SUCCESS_PATTERNS = [
        "Installing new version of the app",
        "Starting the app",
    ];
    private static FAILURE_PATTERNS: PatternToFailure[] = [
        {
            pattern: "Unrecognized command 'run-windows'",
            message: "'rnpm-plugin-windows' doesn't install",
        },
    ];

    constructor(protected runOptions: IWindowsRunOptions, platformDeps: MobilePlatformDeps = {}) {
        super(runOptions, platformDeps);
    }

    public runApp(enableDebug: boolean = true): Q.Promise<void> {
        return TelemetryHelper.generate("WindowsPlatform.runApp", () => {
            const runArguments = this.getRunArgument();
            const env = this.getEnvArgument();

            if (enableDebug) {
                runArguments.push("--proxy");
            }

            return ReactNativeProjectHelper.getReactNativeVersion(this.runOptions.projectRoot)
                .then(version => {
                    // TODO Uncomment when it will be implemented in `react-native-windows`
                    // if (semver.gte(version, WindowsPlatform.NO_PACKAGER_VERSION)) {
                    //     runArguments.push("--no-packager");
                    // }

                    const runWindowsSpawn = new CommandExecutor(this.projectPath, this.logger).spawnReactCommand("run-windows", runArguments, {env});
                    return new OutputVerifier(() => Q(WindowsPlatform.SUCCESS_PATTERNS), () => Q(WindowsPlatform.FAILURE_PATTERNS))
                        .process(runWindowsSpawn);
                });
        });
    }

    public prewarmBundleCache(): Q.Promise<void> {
        return this.packager.prewarmBundleCache("windows");
    }

    public getRunArgument(): string[] {
        let runArguments: string[] = [];

        if (this.runOptions.runArguments  && this.runOptions.runArguments.length > 0) {
            runArguments.push(...this.runOptions.runArguments);
        } else {
            if (this.runOptions.target) {
                runArguments.push(this.runOptions.target === "device" ? this.runOptions.target : "emulator");
            }
        }

        return runArguments;
    }
}
