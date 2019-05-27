# Running automated smoke tests locally

Tests supports running on **Windows 10**, **MacOS Mojave** and **Ubuntu 18.04** machines. Use instructions respected to your machine type.
Please, be aware that automated tests doesn't cover debugging cases on a real devices - only emulators/simulators.

## Prerequisites

Make sure you are on `Node.JS 10.x`.

### Windows only
   * [Install Chocolatey](https://chocolatey.org/install)

### Mac only
   * [Install Homebrew](https://docs.brew.sh/Installation)

## Set up Android SDK environment

1. Install `Java Developement Kit 8`, `Android Studio` and `Git`

   * **Windows**:
    ```ps1
    choco install jdk8 -y
    choco install androidstudio -y
    choco install git -y
    ```
   * **Mac**:
    ```bash
    brew tap caskroom/versions
    brew cask install java8
    brew cask install android-studio
    brew install git
    ```
   * **Ubuntu**:
    ```bash
    apt update
    sudo apt install openjdk-8-jdk
    sudo snap install android-studio --classic
    sudo apt install git
    sudo apt install xvfb
    ```

1. Open Android Studio, and go through the setup.
   * Select `Custom Installation`
   * When you will be asked where to install android sdk choose the following directory:
     * **Windows**: `C:\Users\<username>\Android\sdk`
     * **Mac**: `/Users/<username>/Library/Android/sdk`
     * **Linux**: `/home/<username>/Android/sdk`
1. Add android environment variables to path:
   * **Windows** (Powershell):
    ```ps1
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\<username>\Android\sdk",
    [System.EnvironmentVariableTarget]::Machine)
    [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", "%ANDROID_HOME%",
    [System.EnvironmentVariableTarget]::Machine)
    [Environment]::SetEnvironmentVariable("Path", $env:Path+";%ANDROID_HOME%\emulator;%ANDROID_HOME%\tools;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools\bin",
    [System.EnvironmentVariableTarget]::Machine)
    ```
   * **Mac**:
Add these lines to `~/.bash_profile` (create one if you haven't it):
    ```bash
    export ANDROID_HOME=/Users/<username>/Library/Android/sdk
    export ANDROID_SDK_ROOT=$ANDROID_HOME
    PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools/bin"
    ```
   * **Linux**:
Add these lines to `~/.bash_profile` (create one if you haven't it):
    ```bash
    export ANDROID_HOME=/home/<username>/Android/sdk
    export ANDROID_SDK_ROOT=$ANDROID_HOME
    PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools/bin"
    ```
    > Notice: it's important to add $ANDROID_HOME/emulator before other paths because otherwise emulator will refuse to start from any directory but sdk ones.
1. (**Linux** only) Install **KVM** on your system and **reboot** your system.
   ```bash
   sudo apt install qemu-kvm
   sudo adduser <user_name> kvm
   ```
   where **<user_name>** - name of the user you want to add access to the **KVM**.

1. Open Android studio for any workspace and open **Android Virtual Device Manager(AVD Manager)** at the right top of the window.
1. Create new android virtual device using **x86** image with the parameters you need for testing.
1. Run this command and if emulator starts - you are all set with Android!
    ```bash
    emulator -avd <device_name>
    ```
1. (**Linux** only) Add this line to your `/etc/sysctl.conf` file to manage with [file watching limitation on Linux](https://code.visualstudio.com/docs/setup/linux#_visual-studio-code-is-unable-to-watch-for-file-changes-in-this-large-workspace-error-enospc):
   ```bash
   fs.inotify.max_user_watches=524288
   ```
   Then run
   ```bash
   sudo sysctl -p
   ```
   to apply settings.

## Set up iOS SDK environment (**Mac** only)

1. Install [XCode](https://itunes.apple.com/ru/app/xcode/id497799835?l=en&mt=12)
1. Launch Xcode and install additional required components when prompted.
1. Run `sudo xcode-select -s /Applications/Xcode.app` in terminal
1. Run `brew install carthage` in terminal (*required by Appium*)

## Set up tests

1. Install React Native CLI
   ```sh
   npm i react-native-cli -g
   ```
1. Install Expo CLI
   ```sh
   npm i expo-cli -g
   ```
1. Install Appium
   ```sh
   npm i appium -g
   ```
1. Install Yarn
   ```sh
   npm i yarn -g
   ```
1. [Create](https://expo.io/signup) Expo account if you haven't one. Then login to Expo
   ```sh
   expo login -u 'YOUR_EXPO_LOGIN' -p 'YOUR_EXPO_PASSWORD'
   ```
1. Open `test/smoke` directory and install node packages
   ```sh
   yarn install
   ```
1. Copy extension VSIX to `test/smoke/resources/drop-win` directory

## Running tests

Tests requires several environment variables to be set up before starting:

|Variable|Examples|Explanation|
|---|---|---|
|`ANDROID_EMULATOR`|`Nexus_5X_API_28`|Name of the emulated device|
|`ANDROID_VERSION`|9|Version of android installed on emulated device|
|`IOS_SIMULATOR`|`iPhone 5s`|(**Only for iOS tests**) Name of the simulated device|
|`IOS_VERSION`|12.2|(**Only for iOS tests**) Version of iOS on the simulated device|
|`CODE_VERSION`|`*`, `1.34.1`, `insiders`|Version of VS Code to download and run while running tests|

To create environment variable you can use this commands:
   * **Windows** (Powershell):

   ```ps1
   [Environment]::SetEnvironmentVariable("YOUR_VARIABLE", VALUE, [System.EnvironmentVariableTarget]::Machine)
   ```

   * **Mac/Linux**: Add these lines to `~/.bash_profile`:

   ```bash
   export YOUR_VARIABLE=VALUE
   ```

This approach would be more suited for CI.

For local runs is more convenient to create file `config.json` inside `test/smoke` directory and specify variables there. Example:
```js
{
    "ANDROID_EMULATOR": "Nexus_5X_API_28_x86",
    "ANDROID_VERSION": "9",
    "IOS_SIMULATOR": "iPhone 5s",
    "IOS_VERSION": "12.2",
    "CODE_VERSION" : "*"
}
```

To run tests simply go to smoke tests directory and run command:
```sh
yarn mocha
```
These command will perform pre-tests setup (creating applications, downloading VS Code, cleaning up, etc) and then run Android and iOS tests.

> Notice (**Mac only**): when the tests are being ran for the first time, you need to give permissions for `runsvc.sh` agent process for System Events. Request for the permissions will appear automatically during the tests, so you need to just press `Allow` button. This is required for `expo ios:install` command which runs graphical iOS simulator.

Also, it supports the following parameters:

|Parameter|Explanation|
|---|---|
|`--skip-setup`|Skip pre-tests setup|
|`--ios`|Run iOS tests only|
|`--android`|Run Android tests only|
|`--basic-only`|Run basic tests only (Debug Android, Debug iOS)|
|`--dont-delete-vsix`|Do not delete extension VSIX at the end of the tests execution|

> Notice: if `--ios`, `--android` and `--basic-only` parameters are not set, all iOS and Android tests will be executed.

> Notice: if `--dont-delete-vsix` is not set, then extension will be deleted after execution of the tests.

## Troubleshooting

Several diagnostic logs are written during tests run. `SmokeTestLogs` directory is created on each tests run and contains
* zero-based numbering named directories that corresponds to particular test. There are different diagnostic logs inside such as:
  * `extensionLogs/ReactNative*` - extension output windows logs
  * `chromedriver.log` - logs of Chrome Driver that are used by Spectron
* `appium.log` - logs of Appium server

Also, VS Code instance, that is downloaded and used for running tests, is located in `test/smoke/resources/.vscode-test` directory.
