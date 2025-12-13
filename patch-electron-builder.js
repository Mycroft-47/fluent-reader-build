/**
 * patch-electron-builder.js
 * Explicitly disables ASAR compression in electron-builder.yml.
 * This is required because CLI flags are not being respected.
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

    // --- CRITICAL: Disable ASAR ---
    console.log(`Current ASAR setting: ${config.asar}`);
    config.asar = false;
    
    // Remove asarUnpack if present, as it conflicts with asar=false
    if (config.asarUnpack) {
        delete config.asarUnpack;
    }
    // ------------------------------

    // Write back correctly
    fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1, noRefs: true }));
    console.log('✓ SUCCESS: electron-builder.yml patched. ASAR is now DISABLED.');

} catch (e) {
    console.error('Error patching electron-builder.yml:', e);
    process.exit(1);
}
