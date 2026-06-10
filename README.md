# Mohit's Nuvio Providers

Custom streaming providers for the [Nuvio](https://nuvio.app) app.

## 🔌 How to Install

1. Open the **Nuvio** app on your device
2. Go to **Settings** → **Plugins** (or **Local Scrapers**)
3. Paste this URL in the "Add repository" field:

```
https://raw.githubusercontent.com/Chunduri-Mohit/nuvio/main/nuvio-providers
```

4. Press **Save** / **Submit**
5. All providers will appear in your plugins list

## 📦 Available Providers

| Provider | Description | Quality | Formats |
|----------|-------------|---------|---------|
| **UHDMovies** | UHD Movies with auto-domain resolution (DuckDuckGo + fallback probing) | 480p–2160p | MKV |
| **4KHDHub** | 4KHDHub direct download links | 480p–2160p | MKV |
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
# Build all
npm run build

# Build one
node build.js uhdmovies
```
This bundles each `src/<provider>/index.js` into `providers/<provider>.js` using esbuild, transpiling `async/await` into Hermes-compatible generators.

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
└── nuvio-providers/
    ├── src/                ← Source code (edit these)
    │   ├── uhdmovies/
    │   ├── 4khdhub/
    │   ├── olamovies/
    │   └── example-provider/
    ├── providers/          ← Built output (auto-generated)
    ├── manifest.json       ← Provider registry
    ├── build.js            ← Build script
    ├── server.js           ← Local test server
    ├── test-scraper.js     ← CLI test runner
    └── package.json
```

## ⚠️ Notes

- **UHDMovies** auto-resolves its domain at runtime (DuckDuckGo scrape → known-domain probing → cache for 1 hour). No hardcoded domains.
- Other providers fetch the latest domains from a public domains list.
- Providers run inside the Hermes JS engine (React Native) — avoid Node.js-specific APIs.
- `async/await` is automatically transpiled by esbuild for Hermes compatibility.

## 📄 License

ISC
