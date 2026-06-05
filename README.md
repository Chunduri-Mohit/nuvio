# Custom Media Plugins & Addons Developer Workspace

This workspace contains boilerplate templates and setups to develop custom scrapers/plugins for the **Nuvio** media organizer app and custom addons for **Stremio**.

## Workspace Structure

- `nuvio-providers/` - JavaScript-based scraper plugins for Nuvio.
- `stremio-addon/` - Node.js HTTP server implementing the Stremio Addon Protocol.

---

## 1. Nuvio Scraper Plugins (`nuvio-providers/`)

Nuvio scrapers are JavaScript files that Nuvio downloads and executes inside its sandboxed Hermes JS engine (React Native). Since Hermes has limited support for modern `async/await` in dynamic imports, we write our scrapers in the `src/` folder and compile them using `esbuild`.

### Setup & Installation
1. Navigate to the `nuvio-providers` directory.
2. Install the dev dependencies (esbuild, nodemon) and runner dependencies (express, cors):
   ```bash
   cd nuvio-providers
   npm install
   ```

### Development Workflow
1. **Write Scrapers**: Put each scraper in a folder inside `src/`. For example, `src/my-scraper/index.js`.
2. **Scraper Structure**: Every scraper must export a `getStreams` function:
   ```javascript
   async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
       // Your fetching/scraping logic here
       return [
           {
               name: "My Server Name",
               title: "Video Title",
               url: "https://example.com/stream.mp4",
               quality: "1080p",
               provider: "my-scraper"
           }
       ];
   }
   module.exports = { getStreams };
   ```
3. **Build / Transpile**: To compile your code into the `providers/` directory, run:
   ```bash
   npm run build
   ```
   Or use the watch command to auto-compile as you save:
   ```bash
   npm run build:watch
   ```

### Local Testing in Nuvio
1. Start the local server to serve your manifest and compiled JS scrapers:
   ```bash
   npm start
   ```
   This starts the server on port `3000`.
2. Open your Nuvio app (ensure the device is on the same local network as your PC).
3. Go to **Settings > Developer > Plugin Tester** (Note: You must use the debug version of Nuvio, or add via the normal Plugins menu if it supports local manifests).
4. Enter your computer's local network IP URL:
   `http://192.168.1.XX:3000/manifest.json` (replace with your actual local IP address).

### Publishing Nuvio Plugins
Because Nuvio plugins are static JavaScript files, you can host them for free on **GitHub Pages**:
1. Commit and push the `nuvio-providers` files to a public GitHub repository.
2. Enable GitHub Pages for your repository in Settings.
3. Your manifest URL will be: `https://<your-username>.github.io/<your-repo-name>/manifest.json`
4. Anyone can add this URL to their Nuvio app to install your plugins.

---

## 2. Stremio Custom Addon (`stremio-addon/`)

Stremio addons are simple HTTP web servers that respond in JSON according to the Stremio Addon Protocol.

### Setup & Installation
1. Navigate to the `stremio-addon` directory.
2. Install dependencies (express, cors, nodemon):
   ```bash
   cd stremio-addon
   npm install
   ```

### Running Locally
To start the Stremio addon server locally:
```bash
npm run dev
```
The server will start on port `7000`.

### Stremio Addon Protocol Endpoints
- **Manifest**: `GET /manifest.json`
  Returns the metadata of the addon (name, logo, supported resources/types).
- **Stream**: `GET /stream/:type/:id.json`
  - `:type` is either `movie` or `series`.
  - `:id` is the IMDb ID (e.g. `tt0137523` for movies, or `tt0944947:1:1` for series season 1 episode 1).
  Returns an array of streams:
  ```json
  {
    "streams": [
      {
        "name": "My Stream Provider",
        "title": "Stream Quality Details\n1080p",
        "url": "https://example.com/video.mp4"
      }
    ]
  }
  ```

### Local Testing in Stremio
1. Launch the Stremio App.
2. Navigate to **Add-ons**.
3. In the search box / input field, enter: `http://localhost:7000/manifest.json` and click **Install**.
4. Now, when you open a movie or series in Stremio, your custom addon will appear in the stream list!

### Publishing Stremio Addons
Since Stremio addons are dynamic HTTP servers, you need to host them on a hosting platform:
1. Deploy the Node.js server to **Render.com**, **Fly.io**, **Railway**, or a VPS.
2. Note your deployment's public domain (e.g. `https://my-custom-addon.onrender.com`).
3. To share/install, use: `https://my-custom-addon.onrender.com/manifest.json`.
4. (Optional) For remote testing without deploying, you can expose your local server temporarily using **Ngrok**:
   ```bash
   ngrok http 7000
   ```
   And use the generated `https://xxxx.ngrok-free.app/manifest.json` URL.
