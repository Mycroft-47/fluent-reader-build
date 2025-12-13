/**
 * patch-webpack.js
 * * This script modifies the existing webpack.config.js to:
 * 1. Import 'copy-webpack-plugin'
 * 2. Configure it to bundle WASM files from node_modules into the output directory
 */

const fs = require('fs');
const path = require('path');

const configPath = path.resolve('./webpack.config.js');

if (!fs.existsSync(configPath)) {
    console.error('Error: webpack.config.js not found!');
    process.exit(1);
}

let content = fs.readFileSync(configPath, 'utf8');

// 1. Add the require statement at the top if missing
const requireStatement = 'const CopyPlugin = require("copy-webpack-plugin");';
if (!content.includes('require("copy-webpack-plugin")')) {
    content = requireStatement + '\n' + content;
    console.log('✓ Added CopyPlugin require statement.');
}

// 2. Define the CopyPlugin configuration
// We copy WASM files to 'dist/wasm' so they are separated from the main app code
const copyPluginConfig = `
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/onnxruntime-web/dist/*.wasm',
          to: 'wasm/[name][ext]'
        },
        {
          from: 'node_modules/@mintplex-labs/piper-tts-web/dist/piper_phonemize.{wasm,data}',
          to: 'wasm/[name][ext]'
        }
      ],
    }),`;

// 3. Inject the plugin into the plugins array
// We look for "plugins: [" and insert our config right after
if (content.includes('new CopyPlugin')) {
    console.log('⚠ CopyPlugin already appears to be configured. Skipping injection.');
} else {
    // Regex to find "plugins: [" (allowing for whitespace/newlines)
    const pluginsRegex = /plugins:\s*\[/g;
    
    if (pluginsRegex.test(content)) {
        content = content.replace(pluginsRegex, `plugins: [${copyPluginConfig}`);
        console.log('✓ Injected CopyPlugin configuration.');
    } else {
        console.error('Error: Could not find "plugins: []" array in webpack.config.js');
        process.exit(1);
    }
}

fs.writeFileSync(configPath, content);
console.log('✓ webpack.config.js patched successfully!');