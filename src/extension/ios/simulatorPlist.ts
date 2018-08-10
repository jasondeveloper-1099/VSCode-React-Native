// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as Q from "q";

import {ErrorHelper} from "../../common/error/errorHelper";
import {PlistBuddy} from "./plistBuddy";
import {OutputChannelLogger} from "../log/OutputChannelLogger";
import {FileSystem} from "../../common/node/fileSystem";
import {ChildProcess} from "../../common/node/childProcess";

import {TelemetryHelper} from "../../common/telemetryHelper";

export class SimulatorPlist {
    private projectRoot: string;
    private logger: OutputChannelLogger = OutputChannelLogger.getMainChannel();

    private nodeFileSystem: FileSystem;
    private plistBuddy: PlistBuddy;
    private nodeChildProcess: ChildProcess;

    constructor(projectRoot: string, {
        nodeFileSystem = new FileSystem(),
        plistBuddy = new PlistBuddy(),
        nodeChildProcess = new ChildProcess(),
    } = {}) {
        this.projectRoot = projectRoot;

        this.nodeFileSystem = nodeFileSystem;
        this.plistBuddy = plistBuddy;
        this.nodeChildProcess = nodeChildProcess;
    }

    public findPlistFile(configuration?: string, productName?: string): Q.Promise<string> {

        return Q.all<any>([
            this.plistBuddy.getBundleId(this.projectRoot, true, configuration, productName), // Find the name of the application
            this.nodeChildProcess.exec("xcrun simctl getenv booted HOME").outcome, // Find the path of the simulator we are running
            ]).spread((bundleId: string, pathBuffer: Buffer) => {
                const pathBefore = path.join(pathBuffer.toString().trim(), "Containers", "Data", "Application");
                const pathAfter = path.join("Library", "Preferences", `${bundleId}.plist`);

                // Look through $SIMULATOR_HOME/Containers/Data/Application/*/Library/Preferences to find $BUNDLEID.plist
                return this.nodeFileSystem.readDir(pathBefore).then((apps: string[]) => {
                    this.logger.info(`About to search for plist in base folder: ${pathBefore} pathAfter: ${pathAfter} in each of the apps: ${apps}`);
                    const plistCandidates = apps.map((app: string) => path.join(pathBefore, app, pathAfter)).filter(filePath =>
                        this.nodeFileSystem.existsSync(filePath));
                    if (plistCandidates.length === 0) {
                        throw new Error(`Unable to find plist file for ${bundleId}`);
                    } else if (plistCandidates.length > 1) {
                        TelemetryHelper.sendSimpleEvent("multipleDebugPlistFound");
                        this.logger.warning(ErrorHelper.getWarning("Multiple plist candidates found. Application may not be in debug mode."));
                    }

                    return plistCandidates[0];
                });
            });
    }
}
