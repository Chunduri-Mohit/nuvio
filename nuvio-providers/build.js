#!/usr/bin/env node

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'providers');

// External modules provided by Nuvio - do not bundle these
const EXTERNAL_MODULES = [
    'cheerio-without-node-native',
    'react-native-cheerio',
    'cheerio',
    'crypto-js',
    'axios'
];

function getProvidersToBuild() {
    const args = process.argv.slice(2).filter(arg => !arg.startsWith('-'));

    if (args.length > 0) {
        return args;
    }

    if (!fs.existsSync(srcDir)) {
        console.error('❌ src/ directory not found. Create provider folders in src/<provider>/');
        process.exit(1);
    }

    return fs.readdirSync(srcDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
}

async function buildProvider(providerName) {
    const providerDir = path.join(srcDir, providerName);
    const entryPoint = path.join(providerDir, 'index.js');
    const outFile = path.join(outDir, `${providerName}.js`);

    if (!fs.existsSync(entryPoint)) {
        console.warn(`⚠️  Skipping ${providerName}: no src/${providerName}/index.js found`);
        return false;
    }

    console.log(`🔨 Building provider: ${providerName}...`);

    try {
        await esbuild.build({
            entryPoints: [entryPoint],
            bundle: true,
            outfile: outFile,
            format: 'cjs',              // CommonJS format for Nuvio compatibility
            platform: 'neutral',        // Works inside React Native environment
            target: 'es2016',           // Hermes engine runs ES2016/ES6+ well
            external: EXTERNAL_MODULES,
            minify: false,              // Keep legible for easy debugging
            sourcemap: false,
            logLevel: 'info',
        });
        console.log(`✅ Successfully built: ${outFile}\n`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to build provider ${providerName}:`, error.message);
        return false;
    }
}

async function main() {
    // Create output folder if it doesn't exist
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const providers = getProvidersToBuild();
    if (providers.length === 0) {
        console.log('No providers found in src/ to build.');
        return;
    }

    let successCount = 0;
    for (const provider of providers) {
        const success = await buildProvider(provider);
        if (success) successCount++;
    }

    console.log(`Build complete: ${successCount}/${providers.length} providers built successfully.`);
}

main().catch(err => {
    console.error('Fatal error during build:', err);
    process.exit(1);
});
