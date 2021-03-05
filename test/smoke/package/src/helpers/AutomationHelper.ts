// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { Application } from "../../../automation";
import { SmokeTestsConstants } from "./smokeTestsConstants";

export interface IStackFrame {
    name: string;
    lineNumber: number;
}

const DISCONNECT = `.debug-toolbar .action-label[title*="Disconnect"]`;
const TOOLBAR_HIDDEN = `.debug-toolbar[aria-hidden="true"]`;
const NOT_DEBUG_STATUS_BAR = `.statusbar:not(debugging)`;
const STOP = `.debug-toolbar .action-label[title*="Stop"]`;

export default class AutomationHelper {
    constructor(private app: Application) {}

    private async retryWithSpecifiedPollRetryParameters(
        fun: () => Promise<any>,
        catchFun: () => Promise<any>,
        retryCount: number,
        pollRetryCount: number = 2000,
        pollRetryInterval: number = 100,
    ): Promise<void> {
        let tryes = retryCount;
        while (tryes > 0) {
            try {
                await this.app.workbench.code.executeWithSpecifiedPollRetryParameters(
                    fun,
                    pollRetryCount,
                    pollRetryInterval,
                );
                break;
            } catch (e) {
                await catchFun();
                tryes--;
                if (tryes === 0) {
                    throw e;
                }
            }
        }
    }

    public async openFileWithRetry(
        fileName: string,
        retryCount: number = 3,
        pollRetryCount: number = 10,
        pollRetryInterval: number = 1000,
    ): Promise<any> {
        const fun = async () => await this.app.workbench.quickaccess.openFile(fileName);
        const catchFun = async () => await this.app.workbench.code.dispatchKeybinding("escape");
        await this.retryWithSpecifiedPollRetryParameters(
            fun,
            catchFun,
            retryCount,
            pollRetryCount,
            pollRetryInterval,
        );
    }

    public async runCommandWithRetry(
        commandId: string,
        retryCount: number = 3,
        pollRetryCount: number = 10,
        pollRetryInterval: number = 1000,
    ): Promise<any> {
        const fun = async () => await this.app.workbench.quickaccess.runCommand(commandId);
        const catchFun = async () => await this.app.workbench.code.dispatchKeybinding("escape");
        await this.retryWithSpecifiedPollRetryParameters(
            fun,
            catchFun,
            retryCount,
            pollRetryCount,
            pollRetryInterval,
        );
    }

    public async runDebugScenarioWithRetry(
        scenario: string,
        index: number = 0,
        retryCount: number = 3,
        pollRetryCount: number = 30,
        pollRetryInterval: number = 1000,
    ): Promise<any> {
        const fun = async () => {
            await this.app.workbench.quickaccess.runDebugScenario(scenario, index);
            await this.app.workbench.debug.waitForDebugToolbarExist();
        };
        const catchFun = async () => await this.app.workbench.code.dispatchKeybinding("escape");
        await this.retryWithSpecifiedPollRetryParameters(
            fun,
            catchFun,
            retryCount,
            pollRetryCount,
            pollRetryInterval,
        );
    }

    public async waitForStackFrameWithRetry(
        func: (stackFrame: IStackFrame) => boolean,
        message: string,
        retryCount: number = 3,
        pollRetryCount: number = 60,
        pollRetryInterval: number = 1000,
        beforeWaitForStackFrame?: () => Promise<any>,
    ): Promise<any> {
        const fun = async () => {
            if (beforeWaitForStackFrame) {
                await beforeWaitForStackFrame();
            }
            await this.app.workbench.debug.waitForStackFrame(func, message);
        };
        const catchFun = async () =>
            await this.runCommandWithRetry(SmokeTestsConstants.reloadAppCommand);
        await this.retryWithSpecifiedPollRetryParameters(
            fun,
            catchFun,
            retryCount,
            pollRetryCount,
            pollRetryInterval,
        );
    }

    public async disconnectFromDebuggerWithRetry(
        retryCount: number = 3,
        pollRetryCount: number = 30,
        pollRetryInterval: number = 1000,
    ): Promise<any> {
        const fun = async () => {
            try {
                await Promise.race([
                    this.app.workbench.code.waitAndClick(DISCONNECT),
                    this.app.workbench.code.waitAndClick(STOP),
                ]);
            } catch (e) {}
            await this.app.workbench.code.waitForElement(TOOLBAR_HIDDEN);
            await this.app.workbench.code.waitForElement(NOT_DEBUG_STATUS_BAR);
        };
        const catchFun = async () => {
            return;
        };
        await this.retryWithSpecifiedPollRetryParameters(
            fun,
            catchFun,
            retryCount,
            pollRetryCount,
            pollRetryInterval,
        );
    }

    public async prepareForDebugScenarioCreactionTestWithRetry(
        retryCount: number = 3,
        pollRetryCount: number = 10,
        pollRetryInterval: number = 1000,
    ): Promise<any> {
        const fun = async () => {
            await this.app.workbench.debug.openDebugViewlet();
            await this.app.workbench.debug.configure();
            await this.app.workbench.terminal.showTerminalWithoutNecessaryFocus();
        };
        const catchFun = async () => await this.app.workbench.code.dispatchKeybinding("escape");
        await this.retryWithSpecifiedPollRetryParameters(
            fun,
            catchFun,
            retryCount,
            pollRetryCount,
            pollRetryInterval,
        );
    }
}
