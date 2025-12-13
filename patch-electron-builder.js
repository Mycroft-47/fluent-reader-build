/**
 * patch-electron-builder.js
 * Adds asarUnpack configuration to electron-builder.yml to exclude WASM files from ASAR
 * so they can be loaded dynamically at runtime.
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

    // Initialize asarUnpack if it doesn't exist
    if (!config.asarUnpack) {
        config.asarUnpack = [];
    } else if (typeof config.asarUnpack === 'string') {
        // Convert string to array if necessary
        config.asarUnpack = [config.asarUnpack];
    }

    // The pattern matches the source path in your project
    const wasmPattern = 'dist/wasm/**/*';

    if (!config.asarUnpack.includes(wasmPattern)) {
        config.asarUnpack.push(wasmPattern);
        console.log(`✓ Added "${wasmPattern}" to asarUnpack.`);
        
        // Write the changes back to the file
        // noRefs: true prevents using YAML references which might confuse some parsers
        fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1, noRefs: true }));
        console.log('✓ electron-builder.yml patched successfully!');
    } else {
        console.log('⚠ WASM unpack rule already exists.');
    }

} catch (e) {
    console.error('Error patching electron-builder.yml:', e);
    process.exit(1);
}