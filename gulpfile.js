// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

var gulp = require('gulp');
var log = require('gulp-util').log;
var sourcemaps = require('gulp-sourcemaps');
var process = require("process");
var path = require('path');
var runSequence = require("run-sequence");
var ts = require('gulp-typescript');
var mocha = require('gulp-mocha');
var GulpExtras = require("./tools/gulp-extras");
var copyright = GulpExtras.checkCopyright;
var imports = GulpExtras.checkImports;
var executeCommand = GulpExtras.executeCommand;

var srcPath = 'src';
var outPath = 'out';

var sources = [
    srcPath,
].map(function (tsFolder) { return tsFolder + '/**/*.ts'; })
    .concat(['test/*.ts']);

// TODO: The file property should point to the generated source (this implementation adds an extra folder to the path)
// We should also make sure that we always generate urls in all the path properties (We shouldn't have \\s. This seems to
// be an issue on Windows platforms)
gulp.task('build', ["check-imports", "check-copyright"], function () {
    var tsProject = ts.createProject('tsconfig.json');
    return tsProject.src()
        .pipe(sourcemaps.init())
        .pipe(ts(tsProject))
        .pipe(sourcemaps.write('.', {
            includeContent: false,
            sourceRoot: function (file) {
                return path.relative(path.dirname(file.path), __dirname + '/src');
            }
        }))
        .pipe(gulp.dest(outPath));
});

gulp.task('watch', ['build'], function (cb) {
    log('Watching build sources...');
    return gulp.watch(sources, ['build']);
});

gulp.task('default', function (callback) {
    runSequence("clean", "build", "tslint", callback);
});

var lintSources = [
    srcPath,
].map(function (tsFolder) { return tsFolder + '/**/*.ts'; });
lintSources = lintSources.concat([
    '!src/typings/**'
]);

var tslint = require('gulp-tslint');
gulp.task('tslint', function () {
    return gulp.src(lintSources, { base: '.' })
        .pipe(tslint())
        .pipe(tslint.report('verbose'));
});

function test() {
    return gulp.src(['out/test/**/*.test.js', '!out/test/extension/**'])
        .pipe(mocha({
            ui: 'tdd',
            useColors: true,
            invert: true,
            grep: "extensionContext" // Do not run tests intended for the extensionContext
        }));
}

gulp.task('build-test', ['build'], test);
gulp.task('test', test);

gulp.task('check-imports', function (cb) {
    var tsProject = ts.createProject('tsconfig.json');
    return tsProject.src()
        .pipe(imports());
});

gulp.task('check-copyright', function (cb) {
    return gulp.src([
            "**/*.ts",
            "**/*.js",
            "!**/*.d.ts",
            "!node_modules/**/*.*",
            "!SampleApplication/**/*.js"
        ])
        .pipe(copyright());
});

gulp.task('watch-build-test', ['build', 'build-test'], function () {
    return gulp.watch(sources, ['build', 'build-test']);
});

gulp.task("clean", function () {
    var del = require("del");
    var pathsToDelete = [
        outPath,
        ".vscode-test"
    ].map(function (folder) {
        return folder + "/**";
    });
    return del(pathsToDelete, { force: true });
});

gulp.task("package", function (callback) {
    var command = path.join(__dirname, "node_modules", ".bin", "vsce" + (process.platform === "win32" ? ".cmd" : ""));
    var args = ["package"];
    executeCommand(command, args, callback);
});