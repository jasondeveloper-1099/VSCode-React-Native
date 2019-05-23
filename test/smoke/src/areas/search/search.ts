// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SpectronApplication } from "../../spectron/application";
import { Viewlet } from "../workbench/viewlet";

const VIEWLET = "div[id=\"workbench.view.search\"] .search-view";
const INPUT = `${VIEWLET} .search-widget .search-container .monaco-inputbox input`;
const INCLUDE_INPUT = `${VIEWLET} .query-details .monaco-inputbox input[aria-label="Search Include/Exclude Patterns"]`;

export class Search extends Viewlet {

    constructor(spectron: SpectronApplication) {
        super(spectron);
    }

    public async openSearchViewlet(): Promise<any> {
        await this.spectron.runCommand("workbench.view.search");
        await this.spectron.client.waitForActiveElement(INPUT);
    }

    public async searchFor(text: string): Promise<void> {
        await this.spectron.client.click(INPUT);
        await this.spectron.client.waitForActiveElement(INPUT);
        await this.spectron.client.setValue(INPUT, text);
        await this.submitSearch();
    }

    public async submitSearch(): Promise<void> {
        await this.spectron.client.click(INPUT);
        await this.spectron.client.waitForActiveElement(INPUT);

        await this.spectron.client.keys(["Enter", "NULL"]);
        await this.spectron.client.element(`${VIEWLET} .messages[aria-hidden="false"]`);
    }

    public async setFilesToIncludeText(text: string): Promise<void> {
        await this.spectron.client.click(INCLUDE_INPUT);
        await this.spectron.client.waitForActiveElement(INCLUDE_INPUT);
        await this.spectron.client.setValue(INCLUDE_INPUT, text || "");
    }

    public async showQueryDetails(): Promise<void> {
        if (!await this.areDetailsVisible()) {
            await this.spectron.client.waitAndClick(`${VIEWLET} .query-details .more`);
        }
    }

    public async hideQueryDetails(): Promise<void> {
        if (await this.areDetailsVisible()) {
            await this.spectron.client.waitAndClick(`${VIEWLET} .query-details.more .more`);
        }
    }

    public async areDetailsVisible(): Promise<boolean> {
        const element = await this.spectron.client.element(`${VIEWLET} .query-details.more`);
        return !!element;
    }

    public async removeFileMatch(index: number): Promise<void> {
        await this.spectron.client.waitAndMoveToObject(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch`);
        const file = await this.spectron.client.waitForText(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch a.label-name`);
        await this.spectron.client.waitAndClick(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch .action-label.icon.action-remove`);
        await this.spectron.client.waitForText(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch a.label-name`, void 0, result => result !== file);
    }

    public async expandReplace(): Promise<void> {
        await this.spectron.client.waitAndClick(`${VIEWLET} .search-widget .monaco-button.toggle-replace-button.collapse`);
    }

    public async setReplaceText(text: string): Promise<void> {
        await this.spectron.client.waitAndClick(`${VIEWLET} .search-widget .replace-container .monaco-inputbox input[title="Replace"]`);
        await this.spectron.client.element(`${VIEWLET} .search-widget .replace-container .monaco-inputbox.synthetic-focus input[title="Replace"]`);
        await this.spectron.client.setValue(`${VIEWLET} .search-widget .replace-container .monaco-inputbox.synthetic-focus input[title="Replace"]`, text);
    }

    public async replaceFileMatch(index: number): Promise<void> {
        await this.spectron.client.waitAndMoveToObject(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch`);
        await this.spectron.client.click(`${VIEWLET} .results .monaco-tree-rows>:nth-child(${index}) .filematch .action-label.icon.action-replace-all`);
    }

    public async waitForResultText(text: string): Promise<void> {
        await this.spectron.client.waitForText(`${VIEWLET} .messages[aria-hidden="false"] .message>p`, text);
    }
}
