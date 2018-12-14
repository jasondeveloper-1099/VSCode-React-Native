// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.
import { ErrorHelper } from "../../../src/common/error/errorHelper";
import { InternalErrorCode } from "../../../src/common/error/internalErrorCode";
import * as assert from "assert";

suite("errorHelper", function() {
    suite("commonContext", function() {
        const internalErrorWithArgs = ErrorHelper.getInternalError(InternalErrorCode.NotAllSuccessPatternsMatched, "android", "ios");
        const internalErrorWithoutArgs = ErrorHelper.getInternalError(InternalErrorCode.UnsupportedCommandStatus);

        test("internal error object with arguments should have correct NotAllSuccessPatternsMatched error message on English", (done: MochaDone) => {
            assert.equal(internalErrorWithArgs.message, "Unknown error: not all success patterns were matched. \n It means that \"react-native run-android\" command failed. \n Please, check the View -> Toggle Output -> React Native, \n View -> Toggle Output -> React Native: Run ios output windows. (error code 712)");
            done();
        });

        test("internal error object without arguments should have correct UnsupportedCommandStatus error message on English", (done: MochaDone) => {
            assert.equal(internalErrorWithoutArgs.message, "Unsupported command status (error code 112)");
            done();
        });


    });
});
