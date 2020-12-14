// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { PlatformType } from "../launchArgs";
import { DebugScenarioType } from "./debugConfigTypesAndConstants";
import { DEBUG_TYPES } from "./debugConfigTypesAndConstants";

interface DebugScenarioName {
    debugScenarioType: string;
    prePlatformTypeDescription?: string;
    platformType?: string;
    postPlatformTypeDescription?: string;
    experimentalDescription?: string;
}

export class DebugScenarioNameGenerator {
    public static createScenarioName(
        debugScenarioType: DebugScenarioType,
        debugType: string,
        platformType?: PlatformType | string,
        isExperimental: boolean = false,
    ): string {
        let debugScenarioName: DebugScenarioName = this.createScenarioAccordingToDebugScenarioType(
            debugScenarioType,
        );
        debugScenarioName.platformType = this.getPlatformTypeName(platformType);
        if (debugType === DEBUG_TYPES.REACT_NATIVE) {
            this.configureNotDirectModeScenario(
                debugScenarioName,
                debugScenarioType,
                debugType,
                platformType,
            );
        } else {
            this.configureDirectModeScenario(
                debugScenarioName,
                debugScenarioType,
                debugType,
                platformType,
            );
        }

        if (isExperimental) {
            debugScenarioName.experimentalDescription = "- Experimental";
        }

        return this.debugScenarioNameToString(debugScenarioName);
    }

    private static createScenarioAccordingToDebugScenarioType(
        debugScenarioType: DebugScenarioType,
    ): DebugScenarioName {
        switch (debugScenarioType) {
            case DebugScenarioType.RunApp:
                return {
                    debugScenarioType: "Run",
                };
            case DebugScenarioType.DebugApp:
                return {
                    debugScenarioType: "Debug",
                };
            case DebugScenarioType.AttachApp:
                return {
                    debugScenarioType: "Attach to",
                };
        }
    }

    private static configureNotDirectModeScenario(
        debugScenarioName: DebugScenarioName,
        debugScenarioType: DebugScenarioType,
        debugType: string,
        platformType?: PlatformType | string,
    ): void {
        if (debugScenarioType === DebugScenarioType.AttachApp) {
            debugScenarioName.platformType = "packager";
        }
        if (platformType === PlatformType.Exponent) {
            debugScenarioName.prePlatformTypeDescription = "in";
        }
    }

    private static configureDirectModeScenario(
        debugScenarioName: DebugScenarioName,
        debugScenarioType: DebugScenarioType,
        debugType: string,
        platformType?: PlatformType | string,
    ) {
        switch (platformType) {
            case PlatformType.Android:
                if (debugScenarioType === DebugScenarioType.AttachApp) {
                    debugScenarioName.prePlatformTypeDescription = "the React Native";
                    debugScenarioName.platformType = "Hermes";
                } else {
                    debugScenarioName.postPlatformTypeDescription = "Hermes";
                }
                break;
            case PlatformType.iOS:
                if (debugScenarioType === DebugScenarioType.AttachApp) {
                    debugScenarioName.prePlatformTypeDescription = "the React Native";
                } else {
                    debugScenarioName.prePlatformTypeDescription = "Direct";
                }
                break;
        }
    }

    private static getPlatformTypeName(platformType?: PlatformType | string): string {
        switch (platformType) {
            case PlatformType.Android:
                return "Android";
            case PlatformType.iOS:
                return "iOS";
            case PlatformType.Exponent:
                return "Exponent";
            case PlatformType.Windows:
                return "Windows";
            case PlatformType.WPF:
                return "WPF";
            case PlatformType.macOS:
                return "macOS";
            default:
                return "";
        }
    }

    private static debugScenarioNameToString(debugScenarioName: DebugScenarioName): string {
        let debugScenarioNameStr = debugScenarioName.debugScenarioType;
        if (debugScenarioName.prePlatformTypeDescription) {
            debugScenarioNameStr += ` ${debugScenarioName.prePlatformTypeDescription}`;
        }
        if (debugScenarioName.platformType) {
            debugScenarioNameStr += ` ${debugScenarioName.platformType}`;
        }
        if (debugScenarioName.postPlatformTypeDescription) {
            debugScenarioNameStr += ` ${debugScenarioName.postPlatformTypeDescription}`;
        }
        if (debugScenarioName.experimentalDescription) {
            debugScenarioNameStr += ` ${debugScenarioName.experimentalDescription}`;
        }

        return debugScenarioNameStr;
    }
}
