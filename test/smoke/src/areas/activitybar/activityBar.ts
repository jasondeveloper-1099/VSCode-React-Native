// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { Element } from "webdriverio";
import { SpectronApplication } from "../../spectron/application";

export enum ActivityBarPosition {
    LEFT = 0,
    RIGHT = 1,
}

export class ActivityBar {

    constructor(private spectron: SpectronApplication) {
        // noop
    }

    public async getActivityBar(position: ActivityBarPosition): Promise<Element> {
        let positionClass: string;

        if (position === ActivityBarPosition.LEFT) {
            positionClass = "left";
        } else if (position === ActivityBarPosition.RIGHT) {
            positionClass = "right";
        } else {
            throw new Error("No such position for activity bar defined.");
        }

        return this.spectron.client.waitForElement(`.part.activitybar.${positionClass}`);
    }
}