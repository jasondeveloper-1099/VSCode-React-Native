// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { SpectronApplication } from "../../spectron/application";

export class References {

    private static readonly REFERENCES_WIDGET = ".monaco-editor .zone-widget .zone-widget-container.peekview-widget.reference-zone-widget.results-loaded";
    private static readonly REFERENCES_TITLE_FILE_NAME = `${References.REFERENCES_WIDGET} .head .peekview-title .filename`;
    private static readonly REFERENCES_TITLE_COUNT = `${References.REFERENCES_WIDGET} .head .peekview-title .meta`;
    private static readonly REFERENCES = `${References.REFERENCES_WIDGET} .body .ref-tree.inline .monaco-tree-row .reference`;

    constructor(private spectron: SpectronApplication) {
    }

    public async waitUntilOpen(): Promise<void> {
        await this.spectron.client.waitForElement(References.REFERENCES_WIDGET);
    }

    public async waitForReferencesCountInTitle(count: number): Promise<void> {
        await this.spectron.client.waitForText(References.REFERENCES_TITLE_COUNT, void 0, titleCount => {
            const matches = titleCount.match(/\d+/);
            return matches ? parseInt(matches[0], 10) === count : false;
        });
    }

    public async waitForReferencesCount(count: number): Promise<void> {
        await this.spectron.client.waitForElements(References.REFERENCES, result => result && result.length === count);
    }

    public async waitForFile(file: string): Promise<void> {
        await this.spectron.client.waitForText(References.REFERENCES_TITLE_FILE_NAME, file);
    }

    public async close(): Promise<void> {
        await this.spectron.client.keys(["Escape", "NULL"]);
        await this.spectron.client.waitForElement(References.REFERENCES_WIDGET, element => !element);
    }
}