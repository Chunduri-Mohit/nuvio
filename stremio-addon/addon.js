const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 7000;

// Enable CORS for all origins (Stremio client runs on multiple platforms/hosts)
app.use(cors());

// Load manifest.json
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

// 1. Manifest Endpoint
app.get('/manifest.json', (req, res) => {
    res.json(manifest);
});

// 2. Stream Resource Endpoint
// Format: /stream/:type/:id.json
// Example: /stream/movie/tt0137523.json
// Example: /stream/series/tt0944947:1:1.json
app.get('/stream/:type/:id.json', (req, res) => {
    const { type, id } = req.params;
    
    // Remove the extension ".json" from the ID if it's there
    const cleanId = id.replace('.json', '');
    
    console.log(`[Stremio Addon] Received stream request: Type=${type}, ID=${cleanId}`);
    
    // Parse IMDB ID, season, and episode for series
    let imdbId = cleanId;
    let season = null;
    let episode = null;
    
    if (type === 'series') {
        const parts = cleanId.split(':');
        imdbId = parts[0];
        season = parts[1];
        episode = parts[2];
    }
    
    const streams = [];
    
    try {
        // Here you would implement your backend searching/scraping/scraping resolvers.
        // For demonstration, we'll return playable public streams based on type.
        if (type === 'movie') {
            streams.push({
                name: "Custom Stream\n1080p",
                title: `Big Buck Bunny (Direct Video Link)\nIMDB: ${imdbId}`,
                url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
            });
            streams.push({
                name: "Custom HLS\n720p",
                title: `Sintel (HLS Stream Playlist)\nIMDB: ${imdbId}`,
                url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8"
            });
        } else if (type === 'series') {
            streams.push({
                name: "Custom Stream\n1080p",
                title: `Tears of Steel (Direct Video Link)\nSeason ${season}, Episode ${episode}\nIMDB: ${imdbId}`,
                url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
            });
        }
        
        res.json({ streams });
    } catch (error) {
        console.error("[Stremio Addon] Error generating stream list:", error);
        res.json({ streams: [] });
    }
});

// Root path details
app.get('/', (req, res) => {
    res.send(`
        <h1>Stremio Custom Addon</h1>
        <p>Status: <strong>Running</strong></p>
        <p>Manifest URL: <a href="/manifest.json">/manifest.json</a></p>
        <p>To install: Open Stremio, go to Add-ons, click "Add Page/URL" and paste: <code>http://localhost:${PORT}/manifest.json</code></p>
    `);
});

app.listen(PORT, () => {
    console.log(`\n🚀 Stremio Custom Addon running at: http://localhost:${PORT}`);
    console.log(`📡 Manifest endpoint: http://localhost:${PORT}/manifest.json`);
    console.log(`💡 To test on your local Stremio app, install: http://localhost:${PORT}/manifest.json\n`);
});
