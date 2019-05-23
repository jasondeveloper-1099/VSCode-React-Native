// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SpectronApplication } from "../../spectron/application";

const PANEL_SELECTOR = "div[id=\"workbench.panel.terminal\"]";
const XTERM_SELECTOR = `${PANEL_SELECTOR} .terminal-wrapper`;

export class Terminal {

    constructor(private spectron: SpectronApplication) { }

    public async showTerminal(): Promise<void> {
        if (!await this.isVisible()) {
            await this.spectron.workbench.quickopen.runCommand("View: Toggle Integrated Terminal");
            await this.spectron.client.waitForElement(XTERM_SELECTOR);
            await this.waitForTerminalText(text => text.length > 0, "Waiting for Terminal to be ready");
        }
    }

    public async isVisible(): Promise<boolean> {
        const element = await this.spectron.client.element(PANEL_SELECTOR);
        return !!element;
    }

    public async runCommand(commandText: string): Promise<void> {
        // await this.spectron.client.type(commandText);
        await this.spectron.client.keys(["Enter", "NULL"]);
    }

    public async waitForTerminalText(fn: (text: string[]) => boolean, timeOutDescription: string = "Getting Terminal Text"): Promise<string[]> {
        return this.spectron.client.waitFor(async () => {
            const terminalText = await this.getTerminalText();
            if (fn(terminalText)) {
                return terminalText;
            }
            return undefined;
        }, void 0, timeOutDescription);
    }

    public getCurrentLineNumber(): Promise<number> {
        return this.getTerminalText().then(text => text.length);
    }

    private async getTerminalText(): Promise<string[]> {
        return await this.spectron.webclient.selectorExecute(XTERM_SELECTOR,
            div => {
                const xterm = (<any>(Array.isArray(div) ? div[0] : div)).xterm;
                const buffer = xterm.buffer;
                const lines: string[] = [];
                for (let i = 0; i < buffer.lines.length; i++) {
                    lines.push(buffer.translateBufferLineToString(i, true));
                }
                return lines;
            }
        );
    }
}
