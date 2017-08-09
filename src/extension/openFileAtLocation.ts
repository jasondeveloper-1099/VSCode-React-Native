// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import {RemoteExtension} from "../common/remoteExtension";
import {ReactNativeProjectHelper} from "../common/reactNativeProjectHelper";
import {InternalErrorCode} from "../common/error/internalErrorCode";
import {ErrorHelper} from "../common/error/errorHelper";
import * as path from "path";
import * as Q from "q";

/* Usage:
...path\openFileAtLocation.js filename:lineNumber
...path\openFileAtLocation.js filename
...path\openFileAtLocation.js workspace filename:lineNumber
...path\openFileAtLocation.js workspace filename
*/

{
    if (process.argv.length < 3) {
        throw "Wrong number of parameters provided. Please refer to the usage of this script for proper use.";
    }

    let fullpath: string;
    let workspace: string;

    if (process.argv.length === 3) {
        fullpath = process.argv[2];
        workspace = "";
    } else {
        fullpath = process.argv[3];
        workspace = process.argv[2];
    }

    const dirname = path.normalize(path.dirname(fullpath));

    // In Windows this should make sure c:\ is always lowercase and in
    // Unix '/'.toLowerCase() = '/'
    const normalizedDirname = dirname.toLowerCase();
    const filenameAndNumber = path.basename(fullpath);
    const fileInfo = filenameAndNumber.split(":");
    const filename = path.join(normalizedDirname, fileInfo[0]);
    let lineNumber: number = 1;

    if (fileInfo.length >= 2) {
        lineNumber = parseInt(fileInfo[1], 10);
    }

    getReactNativeWorkspaceForFile(filename, workspace).then(projectRootPath => {
        const remoteExtension = RemoteExtension.atProjectRootPath(projectRootPath);
        return remoteExtension.openFileAtLocation(filename, lineNumber);
    }).done(() => { }, (reason) => {
        throw ErrorHelper.getNestedError(reason, InternalErrorCode.CommandFailed,
            "Unable to communicate with VSCode. Please make sure it is open in the appropriate workspace.");
    });
}

function getReactNativeWorkspaceForFile(file: string, workspace: string): Q.Promise<string> {
    if (workspace) {
        return Q(workspace);
    }
    return getPathForRNParentWorkspace(path.dirname(file))
        .catch((reason) => {
            return Q.reject<string>(ErrorHelper.getNestedError(reason, InternalErrorCode.WorkspaceNotFound, `Error while looking at workspace for file: ${file}.`));
        });
}

function getPathForRNParentWorkspace(dir: string): Q.Promise<string> {
    const reactNativeProjectHelper = new ReactNativeProjectHelper(dir);
    return reactNativeProjectHelper.isReactNativeProject().then(isRNProject => {
        if (isRNProject) {
            return dir;
        }
        if (dir === "" || dir === "." || dir === "/" || dir === path.dirname(dir)) {
            return Q.reject<string>(ErrorHelper.getInternalError(InternalErrorCode.WorkspaceNotFound, "React Native project workspace not found."));
        }
        return getPathForRNParentWorkspace(path.dirname(dir));
    });
}
