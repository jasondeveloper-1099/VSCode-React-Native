// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { Application } from "spectron";
import { RawResult, Element } from "webdriverio";
import { SpectronApplication } from "./application";

/**
 * Abstracts the Spectron's WebdriverIO managed client property on the created Application instances.
 */
export class SpectronClient {

    // waitFor calls should not take more than 200 * 100 = 20 seconds to complete, excluding
    // the time it takes for the actual retry call to complete
    private retryCount: number;
    private readonly retryDuration = 100; // in milliseconds

    private running = false;

    constructor(
        readonly spectron: Application,
        private application: SpectronApplication,
        waitTime: number
    ) {
        this.retryCount = (waitTime * 1000) / this.retryDuration;
    }

    public keys(keys: string[]): Promise<void> {
        this.spectron.client.keys(keys);
        return Promise.resolve();
    }

    public async getText(selector: string, capture: boolean = true): Promise<any> {
        return this.spectron.client.getText(selector);
    }

    public async waitForText(selector: string, text?: string, accept?: (result: string) => boolean): Promise<string> {
        accept = accept ? accept : result => text !== void 0 ? text === result : !!result;
        return this.waitFor(() => this.spectron.client.getText(selector), accept, `getText with selector ${selector}`);
    }

    public async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean): Promise<string> {
        accept = accept ? accept : (result => textContent !== void 0 ? textContent === result : !!result);
        const fn = async () => await this.spectron.client.selectorExecute(selector, div => Array.isArray(div) ? div[0].textContent : div.textContent);
        return this.waitFor(fn, s => accept!(typeof s === "string" ? s : ""), `getTextContent with selector ${selector}`);
    }

    public async waitForValue(selector: string, value?: string, accept?: (result: string) => boolean): Promise<any> {
        accept = accept ? accept : result => value !== void 0 ? value === result : !!result;
        return this.waitFor(() => this.spectron.client.getValue(selector), accept, `getValue with selector ${selector}`);
    }

    public async waitAndClick(selector: string): Promise<any> {
        return this.waitFor(() => this.spectron.client.click(selector), void 0, `click with selector ${selector}`);
    }

    public async click(selector: string): Promise<any> {
        return this.spectron.client.click(selector);
    }

    public async doubleClickAndWait(selector: string, capture: boolean = true): Promise<any> {
        return this.waitFor(() => this.spectron.client.doubleClick(selector), void 0, `doubleClick with selector ${selector}`);
    }

    public async leftClick(selector: string, xoffset: number, yoffset: number, capture: boolean = true): Promise<any> {
        return this.spectron.client.leftClick(selector, xoffset, yoffset);
    }

    public async rightClick(selector: string, capture: boolean = true): Promise<any> {
        return this.spectron.client.rightClick(selector);
    }

    public async moveToObject(selector: string, capture: boolean = true): Promise<any> {
        return this.spectron.client.moveToObject(selector);
    }

    public async waitAndMoveToObject(selector: string): Promise<any> {
        return this.waitFor(() => this.spectron.client.moveToObject(selector), void 0, `move to object with selector ${selector}`);
    }

    public async setValue(selector: string, text: string, capture: boolean = true): Promise<any> {
        return this.spectron.client.setValue(selector, text);
    }

    public async waitForElements(selector: string, accept: (result: Element[]) => boolean = result => result.length > 0): Promise<Element[]> {
        return this.waitFor<RawResult<Element[]>>(() => this.spectron.client.elements(selector), result => accept(result.value), `elements with selector ${selector}`)
            .then(result => result.value);
    }

    public async waitForElement(selector: string, accept: (result: Element | undefined) => boolean = result => !!result): Promise<Element> {
        return this.waitFor<RawResult<Element>>(() => this.spectron.client.element(selector), result => accept(result ? result.value : void 0), `element with selector ${selector}`)
            .then(result => result.value);
    }

    public async waitForVisibility(selector: string, accept: (result: boolean) => boolean = result => result): Promise<any> {
        return this.waitFor(() => this.spectron.client.isVisible(selector), accept, `isVisible with selector ${selector}`);
    }

    public async element(selector: string): Promise<Element> {
        return this.spectron.client.element(selector)
            .then(result => result.value);
    }

    public async waitForActiveElement(selector: string): Promise<any> {
        return this.waitFor(
            () => this.spectron.client.execute(s => {
                if (document.activeElement) {
                    return document.activeElement.matches(s);
                } else {
                    throw new Error("Active element is null");
                }
            }, selector),
            r => r.value,
            `wait for active element: ${selector}`
        );
    }

    public async waitForAttribute(selector: string, attribute: string, accept: (result: string) => boolean = result => !!result): Promise<string> {
        return this.waitFor<string>(() => this.spectron.client.getAttribute(selector), accept, `attribute with selector ${selector}`);
    }

    public async dragAndDrop(sourceElem: string, destinationElem: string, capture: boolean = true): Promise<any> {
        return this.spectron.client.dragAndDrop(sourceElem, destinationElem);
    }

    public async selectByValue(selector: string, value: string, capture: boolean = true): Promise<any> {
        return this.spectron.client.selectByValue(selector, value);
    }

    public async getValue(selector: string, capture: boolean = true): Promise<any> {
        return this.spectron.client.getValue(selector);
    }

    public async getAttribute(selector: string, attribute: string, capture: boolean = true): Promise<any> {
        return Promise.resolve(this.spectron.client.getAttribute(selector, attribute));
    }

    public buttonDown(): any {
        return this.spectron.client.buttonDown();
    }

    public buttonUp(): any {
        return this.spectron.client.buttonUp();
    }

    public async isVisible(selector: string, capture: boolean = true): Promise<any> {
        return this.spectron.client.isVisible(selector);
    }

    public async getTitle(): Promise<string> {
        return this.spectron.client.getTitle();
    }
    public async waitFor<T>(func: () => T | Promise<T | undefined>, accept?: (result: T) => boolean | Promise<boolean>, timeoutMessage?: string, retryCount?: number): Promise<T>;
    public async waitFor<T>(func: () => T | Promise<T>, accept: (result: T) => boolean | Promise<boolean> = result => !!result, timeoutMessage?: string, retryCount?: number): Promise<T> {
        if (this.running) {
            throw new Error("Not allowed to run nested waitFor calls!");
        }

        this.running = true;

        try {
            let trial = 1;
            retryCount = typeof retryCount === "number" ? retryCount : this.retryCount;

            while (true) {
                if (trial > retryCount) {
                    await this.application.screenCapturer.capture("timeout");
                    throw new Error(`${timeoutMessage}: Timed out after ${(retryCount * this.retryDuration) / 1000} seconds.`);
                }

                let result;
                try {
                    result = await func();
                } catch (e) {
                    // console.log(e);
                }

                if (accept(result)) {
                    return result;
                }

                await new Promise(resolve => setTimeout(resolve, this.retryDuration));
                trial++;
            }
        } finally {
            this.running = false;
        }
    }

    // type(text: string): Promise<any> {
    // 	return new Promise((res) => {
    // 		let textSplit = text.split(' ');

    // 		const type = async (i: number) => {
    // 			if (!textSplit[i] || textSplit[i].length <= 0) {
    // 				return res();
    // 			}

    // 			const toType = textSplit[i + 1] ? `${textSplit[i]} ` : textSplit[i];
    // 			await this.keys(toType);
    // 			await this.keys(['NULL']);
    // 			await type(i + 1);
    // 		};

    // 		return type(0);
    // 	});
    // }
}