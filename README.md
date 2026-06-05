# Mohit's Nuvio Providers

Custom streaming providers for the [Nuvio](https://nuvio.app) app.

## 🔌 How to Install

1. Open the **Nuvio** app on your device
2. Go to **Settings** → **Plugins** (or **Local Scrapers**)
3. Paste this URL in the "Add repository" field:

```
https://raw.githubusercontent.com/Chunduri-Mohit/nuvio/main/manifest.json
```

4. Press **Save** / **Submit**
5. All providers will appear in your plugins list

## 📦 Available Providers

| Provider | Description | Quality | Formats |
|----------|-------------|---------|---------|
| **4KHDHub** | 4KHDHub direct download links | 480p–2160p | MKV |
| **UHDMovies** | UHD Movies with multiple resolutions | 720p–2160p | MKV |
| **OlaMovies** | 4K HDR & 60FPS high quality streams | 1080p–2160p | MKV |

## 🛠️ Development

### Prerequisites
- Node.js 16+
- npm

### Setup
```bash
cd nuvio-providers
npm install
```

### Build providers
```bash
npm run build
```
This bundles each `src/<provider>/index.js` into `providers/<provider>.js` using esbuild.

### Test a provider locally
```bash
node test-scraper.js <provider-id> <tmdb-id> [media-type] [season] [episode]

# Examples:
node test-scraper.js uhdmovies 550 movie          # Fight Club
node test-scraper.js 4khdhub 157336 movie          # Interstellar
node test-scraper.js olamovies 496243 movie        # Parasite
node test-scraper.js 4khdhub 1399 tv 1 1           # Game of Thrones S01E01
```

### Watch mode (auto-rebuild on save)
```bash
npm run build:watch
```

## 📁 Project Structure

```
nuvio/
├── manifest.json           ← Root manifest (used by Nuvio app)
├── providers/              ← Root providers (used by Nuvio app)
│   ├── 4khdhub.js
│   ├── uhdmovies.js
│   └── olamovies.js
├── nuvio-providers/        ← Development workspace
│   ├── src/                ← Source code (edit these)
│   │   ├── 4khdhub/
│   │   ├── uhdmovies/
│   │   ├── olamovies/
│   │   └── example-provider/
│   ├── providers/          ← Built output (auto-generated)
│   ├── build.js            ← Build script
│   ├── server.js           ← Local test server
│   ├── test-scraper.js     ← CLI test runner
│   └── package.json
└── stremio-addon/          ← Stremio addon (separate)
```

## ⚠️ Notes

- Domains for these sites change frequently. The providers automatically fetch the latest domains from a public domains list
- Providers run inside the Hermes JS engine (React Native), so avoid Node.js-specific APIs
- `async/await` is transpiled by esbuild for Hermes compatibility
- After editing source files, rebuild and copy the output to `providers/` at root

## 📄 License

ISC
