/**
 * patch-electron-builder.js
 * Disables ASAR compression completely.
 * This ensures all files (including .mjs and .wasm) are physically present on disk,
 * resolving all dynamic import errors.
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

    // --- CRITICAL CHANGE: Disable ASAR ---
    console.log("✓ Disabling ASAR compression...");
    config.asar = false;
    
    // Remove asarUnpack since we are unpacking everything
    if (config.asarUnpack) {
        delete config.asarUnpack;
    }
    // -------------------------------------

    fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1, noRefs: true }));
    console.log('✓ electron-builder.yml patched: ASAR disabled.');

} catch (e) {
    console.error('Error patching electron-builder.yml:', e);
    process.exit(1);
}
