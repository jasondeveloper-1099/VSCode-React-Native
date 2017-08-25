// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {ExtensionMessage, MessagingChannel} from "./extensionMessaging";
import {IInterProcessMessageSender, InterProcessMessageSender} from "./interProcessMessageSender";
import {Telemetry} from "./telemetry";

export class RemoteExtension {
    public static atProjectRootPath(projectRootPath: string) {
        const remoteExtensionServerPath = new MessagingChannel(projectRootPath).getPath();
        const interProcessMessageSender = new InterProcessMessageSender(remoteExtensionServerPath);
        return new RemoteExtension(interProcessMessageSender);
    }

    constructor(private interProcessMessageSender: IInterProcessMessageSender) {}

    public startPackager(): Q.Promise<void> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.START_PACKAGER);
    }

    public startExponentPackager(): Q.Promise<string> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.START_EXPONENT_PACKAGER);
    }

    public prewarmBundleCache(platform: string): Q.Promise<void> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.PREWARM_BUNDLE_CACHE, [platform]);
    }

    public startMonitoringLogcat(debugTarget: string, logCatArguments: string): Q.Promise<void> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.START_MONITORING_LOGCAT, [debugTarget, logCatArguments]);
    }

    public stopMonitoringLogcat(): Q.Promise<void> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.STOP_MONITORING_LOGCAT);
    }

    public sendTelemetry(extensionId: string, extensionVersion: string, appInsightsKey: string, eventName: string,
                         properties?: Telemetry.ITelemetryEventProperties, measures?: Telemetry.ITelemetryEventMeasures): Q.Promise<any> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.SEND_TELEMETRY,
            [extensionId, extensionVersion, appInsightsKey, eventName, properties, measures]);
    }

    public openFileAtLocation(filename: string, lineNumber: number): Q.Promise<void> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.OPEN_FILE_AT_LOCATION, [filename, lineNumber]);
    }

    public getPackagerPort(): Q.Promise<number> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.GET_PACKAGER_PORT);
    }

    public showInformationMessage(infoMessage: string): Q.Promise<void> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.SHOW_INFORMATION_MESSAGE, [infoMessage]);
    }

    public getRunArgs(platform: string, targetType: string): Q.Promise<string[]> {
        return this.interProcessMessageSender.sendMessage(ExtensionMessage.GET_RUN_ARGS, [platform, targetType]);
    }
}