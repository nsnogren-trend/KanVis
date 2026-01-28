const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};

/**
 * Plugin to copy static assets
 */
const copyAssetsPlugin = {
    name: 'copy-assets',
    setup(build) {
        build.onEnd(() => {
            // Ensure dist/webview directory exists
            const webviewDir = path.join(__dirname, 'dist', 'webview');
            if (!fs.existsSync(webviewDir)) {
                fs.mkdirSync(webviewDir, { recursive: true });
            }

            // Copy CSS file
            const srcCss = path.join(__dirname, 'src', 'ui', 'webview', 'styles.css');
            const destCss = path.join(webviewDir, 'styles.css');
            if (fs.existsSync(srcCss)) {
                fs.copyFileSync(srcCss, destCss);
                console.log('[assets] Copied styles.css');
            }
        });
    },
};

async function main() {
    // Build extension
    const extensionCtx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    // Build webview
    const webviewCtx = await esbuild.context({
        entryPoints: ['src/ui/webview/main.ts'],
        bundle: true,
        format: 'iife',
        minify: production,
        sourcemap: !production,
        platform: 'browser',
        outfile: 'dist/webview/main.js',
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin, copyAssetsPlugin],
    });

    if (watch) {
        await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
    } else {
        await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
        await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
