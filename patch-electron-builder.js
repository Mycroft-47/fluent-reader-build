/**
 * patch-electron-builder.js
 * Configures selective unpacking.
 * 1. Unpacks WASM files (the target).
 * 2. Unpacks JS files (the caller).
 * This allows dynamic import() to work because both files exist outside the ASAR archive.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPath = path.resolve('./electron-builder.yml');

if (!fs.existsSync(configPath)) {
    console.error('Error: electron-builder.yml not found!');
    process.exit(1);
}

try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(content);

    // Ensure asarUnpack is an array
    if (!config.asarUnpack) {
        config.asarUnpack = [];
    } else if (typeof config.asarUnpack === 'string') {
        config.asarUnpack = [config.asarUnpack];
    }

    // 1. Unpack WASM/MJS files (The resources we need to load)
    const wasmPattern = 'dist/wasm/**/*';
    if (!config.asarUnpack.includes(wasmPattern)) {
        config.asarUnpack.push(wasmPattern);
    }

    // 2. Unpack Renderer Bundles (The code that performs the import)
    // We use a broad pattern to ensure we catch 'article.js', 'index.js', etc.
    const rendererPattern = 'dist/**/*.js';
    if (!config.asarUnpack.includes(rendererPattern)) {
        config.asarUnpack.push(rendererPattern);
    }

    // Ensure ASAR compression is ON (so we only unpack what's needed)
    config.asar = true;

    fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1, noRefs: true }));
    console.log(`✓ Configured asarUnpack: ${JSON.stringify(config.asarUnpack)}`);

} catch (e) {
    console.error('Error patching electron-builder.yml:', e);
    process.exit(1);
}
