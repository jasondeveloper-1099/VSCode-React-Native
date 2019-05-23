// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SpectronApplication } from "../../spectron/application";

export class QuickOpen {

    public static QUICK_OPEN = "div.monaco-quick-open-widget";
    public static QUICK_OPEN_HIDDEN = "div.monaco-quick-open-widget[aria-hidden=\"true\"]";
    public static QUICK_OPEN_INPUT = `${QuickOpen.QUICK_OPEN} .quick-open-input input`;
    public static QUICK_OPEN_FOCUSED_ELEMENT = `${QuickOpen.QUICK_OPEN} .quick-open-tree .monaco-tree-row.focused .monaco-highlighted-label`;
    public static QUICK_OPEN_ENTRY_SELECTOR = "div[aria-label=\"Quick Picker\"] .monaco-tree-rows.show-twisties .monaco-tree-row .quick-open-entry";
    public static QUICK_OPEN_ENTRY_LABEL_SELECTOR = "div[aria-label=\"Quick Picker\"] .monaco-tree-rows.show-twisties .monaco-tree-row .quick-open-entry .label-name";

    constructor(readonly spectron: SpectronApplication) { }

    public async openQuickOpen(value: string): Promise<void> {
        let retries = 0;

        // Other parts of code might steal focus away from quickopen :(
        while (retries < 5) {
            await this.spectron.runCommand("workbench.action.quickOpen");
            try {
                await this.waitForQuickOpenOpened();
                break;
            } catch (err) {
                if (++retries > 5) {
                    throw err;
                }

                await this.spectron.client.keys(["escape"]);
            }
        }

        if (value) {
            await this.spectron.client.setValue(QuickOpen.QUICK_OPEN_INPUT, value);
        }
    }

    public async closeQuickOpen(): Promise<void> {
        await this.spectron.runCommand("workbench.action.closeQuickOpen");
        await this.waitForQuickOpenClosed();
    }

    public async openFile(fileName: string): Promise<void> {
        await this.openQuickOpen(fileName);

        await this.waitForQuickOpenElements(names => names.some(n => n === fileName));
        await this.spectron.client.keys(["Enter", "NULL"]);
        await this.spectron.workbench.waitForActiveTab(fileName);
        await this.spectron.workbench.waitForEditorFocus(fileName);
    }

    public async runCommand(commandText: string): Promise<void> {
        await this.openQuickOpen(`> ${commandText}`);

        // wait for best choice to be focused
        await this.spectron.client.waitForTextContent(QuickOpen.QUICK_OPEN_FOCUSED_ELEMENT, commandText);

        // wait and click on best choice
        await this.spectron.client.waitAndClick(QuickOpen.QUICK_OPEN_FOCUSED_ELEMENT);
    }

    public async waitForQuickOpenOpened(): Promise<void> {
        await this.spectron.client.waitForActiveElement(QuickOpen.QUICK_OPEN_INPUT);
    }

    public async submit(text: string): Promise<void> {
        await this.spectron.client.setValue(QuickOpen.QUICK_OPEN_INPUT, text);
        await this.spectron.client.keys(["Enter", "NULL"]);
        await this.waitForQuickOpenClosed();
    }

    public async selectQuickOpenElement(index: number): Promise<void> {
        await this.waitForQuickOpenOpened();
        for (let from = 0; from < index; from++) {
            await this.spectron.client.keys(["ArrowDown", "NULL"]);
        }
        await this.spectron.client.keys(["Enter", "NULL"]);
        await this.waitForQuickOpenClosed();
    }

    public async waitForQuickOpenElements(accept: (names: string[]) => boolean): Promise<void> {
        await this.spectron.client.waitFor(() => this.getQuickOpenElements(), accept);
    }

    private async waitForQuickOpenClosed(): Promise<void> {
        await this.spectron.client.waitForElement(QuickOpen.QUICK_OPEN_HIDDEN);
    }

    private async getQuickOpenElements(): Promise<string[]> {
        const result = await this.spectron.webclient.selectorExecute(QuickOpen.QUICK_OPEN_ENTRY_SELECTOR,
            div => (Array.isArray(div) ? div : [div]).map(element => {
                const name = element.querySelector(".label-name") as HTMLElement;
                return name.textContent;
            })
        );

        return Array.isArray(result) ? result : [];
    }
}
