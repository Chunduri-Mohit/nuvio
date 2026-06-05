/**
 * Custom Nuvio Provider Scraper Example
 * 
 * This file serves as a boilerplate for building your own scrapers.
 * A scraper needs to export a getStreams function.
 */

// Import allowed modules here (Cheerio, crypto-js, etc.)
// Note: Mark them as external in build.js so they are loaded from Nuvio's runtime.
const cheerio = require('cheerio-without-node-native');

/**
 * Main scraper function called by Nuvio.
 * 
 * @param {string} tmdbId - The ID of the media on TMDB (e.g. "550")
 * @param {string} mediaType - Either "movie" or "tv"
 * @param {number|string} seasonNum - The season number (only for "tv" media type)
 * @param {number|string} episodeNum - The episode number (only for "tv" media type)
 * @returns {Promise<Array<object>>} A promise that resolves to an array of stream objects
 */
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    console.log(`[Example Provider] Received request for ID: ${tmdbId}, Type: ${mediaType}`);
    
    try {
        // Here you would implement your web scraping/fetching logic.
        // For example:
        // 1. Search a streaming portal or indexer by TMDB ID or title.
        // 2. Fetch the HTML page.
        // 3. Parse with cheerio to extract stream URLs.
        // 4. Resolve/decrypt any embedded video links (like Vidcloud, Upcloud, Streamtape).
        
        // Let's create mock stream items containing public testing streams
        // so you can instantly verify playback inside the Nuvio app.
        const streams = [];

        if (mediaType === 'movie') {
            streams.push({
                name: "Demo Server (MP4) - 1080p",
                title: "Big Buck Bunny (Direct)",
                url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                quality: "1080p",
                provider: "example-provider"
            });
            streams.push({
                name: "Demo Server (M3U8) - 720p",
                title: "Sintel HLS Stream",
                url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
                quality: "720p",
                provider: "example-provider"
            });
        } else if (mediaType === 'tv') {
            streams.push({
                name: "Demo TV Server - 1080p",
                title: `S${seasonNum}E${episodeNum} - Tears of Steel`,
                url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
                quality: "1080p",
                provider: "example-provider"
            });
        }

        return streams;
    } catch (error) {
        console.error("[Example Provider] Error fetching streams:", error);
        return [];
    }
}

// Export the function for Nuvio loading compatibility
module.exports = { getStreams };
