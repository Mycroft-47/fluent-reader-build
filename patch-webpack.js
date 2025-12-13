/**
 * patch-webpack.js
 */
const fs = require('fs');
const path = require('path');

const configPath = path.resolve('./webpack.config.js');

if (!fs.existsSync(configPath)) {
    console.error('Error: webpack.config.js not found!');
    process.exit(1);
}

let content = fs.readFileSync(configPath, 'utf8');

const requireStatement = 'const CopyPlugin = require("copy-webpack-plugin");';
if (!content.includes('require("copy-webpack-plugin")')) {
    content = requireStatement + '\n' + content;
    console.log('✓ Added CopyPlugin require statement.');
}

const copyPluginConfig = `
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/onnxruntime-web/dist/*.{wasm,mjs}',
          to: 'wasm/[name][ext]'
        },
        {
          from: 'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.{wasm,data}',
          to: 'wasm/[name][ext]'
        }
      ],
    }),`;

if (content.includes('new CopyPlugin')) {
    console.log('⚠ CopyPlugin already configured.');
} else {
    const pluginsRegex = /plugins:\s*\[/g;
    if (pluginsRegex.test(content)) {
        content = content.replace(pluginsRegex, `plugins: [${copyPluginConfig}`);
        console.log('✓ Injected CopyPlugin configuration.');
    } else {
        console.error('Error: Could not find "plugins: []" array');
        process.exit(1);
    }
}

fs.writeFileSync(configPath, content);
console.log('✓ webpack.config.js patched successfully!');
