const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all requests so Nuvio app on device/emulator can access it
app.use(cors());

// Serve static provider files
app.use('/providers', express.static(path.join(__dirname, 'providers')));

// Serve manifest.json
app.get('/manifest.json', (req, res) => {
    const manifestPath = path.join(__dirname, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(manifestPath);
    } else {
        res.status(404).json({ error: 'manifest.json not found' });
    }
});

// Root path details
app.get('/', (req, res) => {
    res.json({
        message: "Nuvio Custom Providers Local Server",
        manifestUrl: `http://localhost:${PORT}/manifest.json`,
        status: "Running"
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Nuvio Local Provider Server running at: http://localhost:${PORT}`);
    console.log(`📡 Manifest endpoint: http://localhost:${PORT}/manifest.json`);
    console.log(`📁 Providers files served from /providers/\n`);
    console.log(`💡 To test in Nuvio, ensure your device can reach this IP.`);
    console.log(`👉 If testing on an external device/TV, run on your local network IP (e.g., http://192.168.1.XX:${PORT}/manifest.json)\n`);
});
