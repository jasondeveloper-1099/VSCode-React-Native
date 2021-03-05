// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as path from "path";
import * as fs from "fs";
import { SmokeTestsConstants } from "./smokeTestsConstants";

export default class TestProject {
    private _appName: string;

    private _vsCodeConfigPath: string;
    private _packageJsonPath: string;
    private _metroConfigPath: string;
    private _expoSettingsPath: string;

    private _parentPathForWorkspace: string;
    private _testButtonFileForWorkspace: string;
    private _gradleBuildFilePathForWorkspace: string;

    private _testButtonFileForSample: string;
    private _gradleBuildFilePathForSample: string;

    constructor(private _workspaceDirectory: string, private _sampleDirectory: string) {
        this._appName = path.basename(this.workspaceDirectory);
        this._vsCodeConfigPath = path.join(this.workspaceDirectory, ".vscode");
        this._parentPathForWorkspace = path.join(this.workspaceDirectory, "..");
        this._packageJsonPath = path.join(this.workspaceDirectory, "package.json");
        this._testButtonFileForWorkspace = path.join(this.workspaceDirectory, "AppTestButton.js");
        this._testButtonFileForSample = path.join(this.sampleDirectory, "AppTestButton.js");
        this._metroConfigPath = path.join(this.workspaceDirectory, "metro.config.js");
        this._expoSettingsPath = path.join(this.workspaceDirectory, ".expo", "settings.json");
        this._gradleBuildFilePathForWorkspace = path.join(
            this.workspaceDirectory,
            "android",
            "app",
            "build.gradle",
        );
        this._gradleBuildFilePathForSample = path.join(this.sampleDirectory, "build.gradle");
    }

    public getPlatformFolder(platform: string): string {
        return path.join(this.workspaceDirectory, platform);
    }

    public isExpoProject(): boolean {
        const packageJsonData = JSON.parse(fs.readFileSync(this.packageJsonPath).toString());
        return packageJsonData.dependencies.expo || packageJsonData.devDependencies.expo;
    }

    public getPodfileByPlatformForWorkspace(platform: string): string {
        return path.join(this.workspaceDirectory, platform, "Podfile");
    }
    public getPodfileByPlatformForSample(): string {
        return path.join(this.sampleDirectory, "Podfile");
    }

    private getEntryPoint(diretory: string): string {
        let entryPoint = path.join(diretory, SmokeTestsConstants.ApptsxFileName);
        if (!fs.existsSync(entryPoint)) {
            entryPoint = path.join(diretory, SmokeTestsConstants.AppjsFileName);
        }
        return entryPoint;
    }

    get appName(): string {
        return this._appName;
    }
    get vsCodeConfigPath(): string {
        return this._vsCodeConfigPath;
    }
    get parentPathForWorkspace(): string {
        return this._parentPathForWorkspace;
    }
    get projectEntryPointPath(): string {
        return this.getEntryPoint(this.workspaceDirectory);
    }
    get projectEntryPointFile(): string {
        return path.basename(this.projectEntryPointPath);
    }
    get sampleEntryPointPath(): string {
        return this.getEntryPoint(this.sampleDirectory);
    }
    get workspaceDirectory(): string {
        return this._workspaceDirectory;
    }
    get sampleDirectory(): string {
        return this._sampleDirectory;
    }
    get packageJsonPath(): string {
        return this._packageJsonPath;
    }
    get testButtonFileForWorkspace(): string {
        return this._testButtonFileForWorkspace;
    }
    get testButtonFileForSample(): string {
        return this._testButtonFileForSample;
    }
    get metroConfigPath(): string {
        return this._metroConfigPath;
    }
    get expoSettingsPath(): string {
        return this._expoSettingsPath;
    }
    get gradleBuildFilePathForWorkspace(): string {
        return this._gradleBuildFilePathForWorkspace;
    }
    get gradleBuildFilePathForSample(): string {
        return this._gradleBuildFilePathForSample;
    }
}
