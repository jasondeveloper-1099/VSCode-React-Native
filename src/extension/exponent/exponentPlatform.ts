// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {ErrorHelper} from "../../common/error/errorHelper";
import {InternalErrorCode} from "../../common/error/internalErrorCode";
import {IRunOptions} from "../launchArgs";
import {GeneralMobilePlatform, MobilePlatformDeps} from "../generalMobilePlatform";
import {ExponentHelper} from "./exponentHelper";

import * as vscode from "vscode";
import * as Q from "q";
import {PackagerRunAs} from "../../common/packager";
import {PackagerStatus} from "../packagerStatusIndicator";

export class ExponentPlatform extends GeneralMobilePlatform {
    private exponentTunnelPath: string | null;
    private exponentHelper: ExponentHelper;

    constructor(runOptions: IRunOptions, platformDeps: MobilePlatformDeps = {}) {
        super(runOptions, platformDeps);
        this.exponentHelper = new ExponentHelper(runOptions.workspaceRoot, runOptions.projectRoot);
        this.exponentTunnelPath = null;
    }

    public runApp(): Q.Promise<void> {
        const outputMessage = `Application is running on Exponent. Open your exponent app at ${this.exponentTunnelPath} to see it.`;
        this.logger.info(outputMessage);
        return Q.resolve<void>(void 0);
    }

    public enableJSDebuggingMode(): Q.Promise<void> {
        this.logger.info("Application is running on Exponent. Please shake device and select 'Debug JS Remotely' to enable debugging.");
        return Q.resolve<void>(void 0);
    }

    public startPackager(): Q.Promise<void> {
        this.logger.info("Starting Exponent Packager.");
        return this.packager.isRunning().then((running) => {
            if (running) {
                if (this.packager.getRunningAs() !== PackagerRunAs.EXPONENT) {
                    return this.packager.stop().then(() =>
                        this.packager.statusIndicator.updatePackagerStatus(PackagerStatus.PACKAGER_STOPPED));
                }

                this.logger.info("Attaching to running Exponent packager");
            }
            return void 0;
        }).then(() =>
            this.exponentHelper.configureExponentEnvironment()
            ).then(() =>
                this.exponentHelper.loginToExponent(
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
                ))
            .then(() => {
                return this.packager.startAsExponent();
            })
            .then(exponentUrl => {
                vscode.commands.executeCommand("vscode.previewHtml", vscode.Uri.parse(exponentUrl), 1, "Expo QR code");
                this.packager.statusIndicator.updatePackagerStatus(PackagerStatus.EXPONENT_PACKAGER_STARTED);
                return exponentUrl;
            })
            .then(exponentUrl => {
                if (!exponentUrl) {
                    return Q.reject<void>(ErrorHelper.getInternalError(InternalErrorCode.ExpectedExponentTunnelPath,
                        "No link provided by exponent. Is your project correctly setup?"));
                }
                this.exponentTunnelPath = exponentUrl;
                return Q.resolve(void 0);
            });
    }
}
