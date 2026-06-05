/**
 * Nuvio Provider Local CLI Test Runner
 * 
 * Usage:
 *   node test-scraper.js <provider-id> <tmdb-id> [media-type] [season] [episode]
 * 
 * Examples:
 *   node test-scraper.js uhdmovies 550 movie
 *   node test-scraper.js 4khdhub 1399 tv 1 1
 */

const path = require('path');
const fs = require('fs');

async function testRunner() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log("\n❌ Missing arguments!");
        console.log("Usage: node test-scraper.js <provider-id> <tmdb-id> [media-type] [season] [episode]");
        console.log("Example: node test-scraper.js uhdmovies 550 movie\n");
        process.exit(1);
    }

    const providerId = args[0];
    const tmdbId = args[1];
    const mediaType = args[2] || 'movie';
    const season = args[3] || 1;
    const episode = args[4] || 1;

    const scraperPath = path.join(__dirname, 'src', providerId, 'index.js');

    if (!fs.existsSync(scraperPath)) {
        console.error(`❌ Scraper source file not found at: ${scraperPath}`);
        process.exit(1);
    }

    console.log(`\n🔍 Loading scraper: ${providerId}`);
    const scraper = require(scraperPath);

    if (typeof scraper.getStreams !== 'function') {
        console.error(`❌ Scraper does not export a getStreams function!`);
        process.exit(1);
    }

    console.log(`🚀 Executing getStreams: tmdbId=${tmdbId}, type=${mediaType}, S=${season}, E=${episode}`);
    console.log("-------------------------------------------------------------");

    try {
        const startTime = Date.now();
        const results = await scraper.getStreams(tmdbId, mediaType, season, episode);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("-------------------------------------------------------------");
        console.log(`✅ Completed in ${duration}s`);
        console.log(`📈 Extracted streams: ${results.length}\n`);

        if (results.length > 0) {
            results.forEach((stream, idx) => {
                console.log(`[${idx + 1}] ${stream.name}`);
                console.log(`    Title:    ${stream.title}`);
                console.log(`    Quality:  ${stream.quality}`);
                console.log(`    Size:     ${stream.size || 'N/A'}`);
                console.log(`    URL:      ${stream.url}`);
                console.log("");
            });
        } else {
            console.log("⚠️  No streams returned.");
        }
    } catch (error) {
        console.error("\n❌ Execution crashed with error:", error);
    }
}

testRunner();
