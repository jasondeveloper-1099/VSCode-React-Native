// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

export enum InternalErrorCode {
        // Command Executor errors
        CommandFailed = 101,
        CommandFailedWithErrorCode = 102,
        PackagerStartFailed = 103,
        FailedToRunOnAndroid = 104,
        FailedToRunOnIos = 105,
        FailedToStartPackager = 106,
        FailedToStopPackager = 107,
        PackagerRunningInDifferentPort = 108,
        FailedToRestartPackager = 109,
        FailedToRunExponent = 110,
        FailedToPublishToExpHost = 111,

        // Device Deployer errors
        IOSDeployNotFound = 201,

        // Device Runner errors
        DeviceNotPluggedIn = 301,
        DeveloperDiskImgNotMountable = 302,
        UnableToLaunchApplication = 303,
        ApplicationLaunchTimedOut = 304,

        // iOS Platform errors
        IOSSimulatorNotLaunchable = 401,

        // Packager errors
        OpnPackagerLocationNotFound = 501,
        OpnPackagerNotFound = 502,
        FailedToStopPackagerOnExit = 503,

        // React Native Project errors
        ProjectVersionNotParsable = 601,
        ProjectVersionUnsupported = 602,
        ProjectVersionNotReadable = 603,

        // Miscellaneous errors
        TelemetryInitializationFailed = 701,
        ExtensionActivationFailed = 702,
        DebuggerStubLauncherFailed = 703,
        IntellisenseSetupFailed = 704,
        NodeDebuggerConfigurationFailed = 705,
        DebuggingFailed = 706,
        RNTempFolderDeletionFailed = 707,
        DebuggingFailedInNodeWrapper = 708,
        PlatformNotSupported = 709,
        WorkspaceNotFound = 710,
        ExpectedExponentTunnelPath = 711,

        // Activation errors
        CouldNotFindLocationOfNodeDebugger = 801,

        // Validating user input errors
        ExpectedIntegerValue = 1001,
        ExpectedStringValue = 1002,
        ExpectedBooleanValue = 1003,
        ExpectedArrayValue = 1004,
        ExpectedObjectValue = 1005,

        // Inter Process Communication errors
        ErrorWhileProcessingMessageInIPMSServer = 901,
        ErrorNoPipeFound = 902,
    }
