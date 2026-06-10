/**
 * ============================================================================
 * UHDMovies Provider for Nuvio
 * ============================================================================
 *
 * Scrapes UHDMovies for 4K / 1080p / 720p / 480p download links.
 *
 * DOMAIN RESOLUTION (the domain changes frequently):
 *   1. Primary:  Scrape DuckDuckGo HTML search for "uhdmovies 4k dual audio"
 *                and extract the first uhdmovies.* domain from the results.
 *   2. Fallback: Probe a list of known past domains with HEAD requests and
 *                pick the first one that responds with HTTP 2xx/3xx.
 *   3. Cache:    Resolved domain is cached for 1 hour to avoid repeated lookups.
 *
 * IMPORTANT:
 *   - Uses async/await → MUST be built with `node build.js uhdmovies`
 *     so esbuild transpiles async/await into generators for Hermes.
 *   - Uses only `fetch` for HTTP (no Node built-ins like crypto or fs).
 *   - cheerio is marked external in build.js — provided by Nuvio runtime.
 *
 * Stream object format returned:
 *   { name, title, url, quality, size, headers, provider }
 *
 * ============================================================================
 */

const cheerio = require('cheerio-without-node-native');

// ─── Configuration ──────────────────────────────────────────────────────────

/** TMDB API key used to resolve tmdbId → title + year */
const TMDB_API_KEY = '66a4be2c09e7a3191882b870f449b58a';

/** Browser-like User-Agent sent with every request */
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Known past UHDMovies domains, ordered most-recent-first.
 * Used as a fallback if DuckDuckGo resolution fails.
 * Add new domains to the TOP of this list as they appear.
 */
const KNOWN_DOMAINS = [
    'https://uhdmovies.rodeo',
    'https://uhdmovies.pink',
    'https://uhdmovies.mov',
    'https://uhdmovies.ink',
    'https://uhdmovies.dad',
    'https://uhdmovies.foo',
    'https://uhdmovies.lat',
    'https://uhdmovies.life',
    'https://uhdmovies.work',
    'https://uhdmovies.quest',
    'https://uhdmovies.shop',
    'https://uhdmovies.store',
    'https://uhdmovies.day',
    'https://uhdmovies.world',
    'https://uhdmovies.org.in',
    'https://uhdmovies.cfd',
    'https://uhdmovies.sbs',
];

// ─── Domain Resolution (cached) ────────────────────────────────────────────

/** In-memory cache: { url: string, ts: number } */
let domainCache = { url: null, ts: 0 };

/** Cache TTL: 1 hour */
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Resolve the current live UHDMovies domain.
 *
 * Strategy 1 — DuckDuckGo HTML search:
 *   Fetches the DuckDuckGo HTML results page for "uhdmovies 4k dual audio"
 *   and regex-extracts the first href matching uhdmovies.* TLD.
 *
 * Strategy 2 — Known-domain probing:
 *   Iterates KNOWN_DOMAINS and sends a HEAD request to each.
 *   The first one that responds (status < 400) wins.
 *
 * @returns {Promise<string>} The base URL, e.g. "https://uhdmovies.rodeo"
 */
async function resolveDomain() {
    const now = Date.now();
    if (domainCache.url && now - domainCache.ts < CACHE_TTL) {
        return domainCache.url;
    }

    let resolved = null;

    // ── Strategy 1: DuckDuckGo HTML scrape ──────────────────────────────
    try {
        console.log('[UHDMovies] Resolving domain via DuckDuckGo...');
        const ddgUrl = 'https://html.duckduckgo.com/html/?q=' +
            encodeURIComponent('uhdmovies 4k dual audio');

        const ddgRes = await fetch(ddgUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html',
            },
        });
        const ddgHtml = await ddgRes.text();

        // DuckDuckGo HTML results contain hrefs with uddg= redirect URLs.
        // We look for any URL whose hostname starts with "uhdmovies."
        const domainRegex = /https?:\/\/uhdmovies\.[a-z.]{2,10}/gi;
        const matches = ddgHtml.match(domainRegex);
        if (matches && matches.length > 0) {
            // Deduplicate and pick the first unique domain
            const unique = [...new Set(matches.map(m => m.toLowerCase().replace(/\/$/, '')))];
            resolved = unique[0];
            console.log(`[UHDMovies] DuckDuckGo resolved domain: ${resolved}`);
        }
    } catch (err) {
        console.log('[UHDMovies] DuckDuckGo resolution failed:', err.message);
    }

    // ── Strategy 2: Probe known domains ─────────────────────────────────
    if (!resolved) {
        console.log('[UHDMovies] Falling back to known-domain probing...');
        for (const candidate of KNOWN_DOMAINS) {
            try {
                const probeRes = await fetch(candidate, {
                    method: 'HEAD',
                    headers: { 'User-Agent': USER_AGENT },
                    redirect: 'follow',
                });
                if (probeRes.status < 400) {
                    resolved = candidate;
                    console.log(`[UHDMovies] Probe hit: ${candidate} (${probeRes.status})`);
                    break;
                }
            } catch (_) {
                // Unreachable — try next
            }
        }
    }

    // ── Final fallback ──────────────────────────────────────────────────
    if (!resolved) {
        resolved = KNOWN_DOMAINS[0]; // best guess
        console.log(`[UHDMovies] All resolution failed. Using fallback: ${resolved}`);
    }

    domainCache = { url: resolved, ts: now };
    return resolved;
}

// ─── TMDB Lookup ────────────────────────────────────────────────────────────

/**
 * Fetch the movie/show title and release year from TMDB.
 *
 * @param {string} tmdbId  - Numeric TMDB ID
 * @param {string} mediaType - "movie" or "tv"
 * @returns {Promise<{title: string, year: string}|null>}
 */
async function getMediaDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `https://api.tmdb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (mediaType === 'tv') {
            return {
                title: data.name || '',
                year: data.first_air_date ? data.first_air_date.split('-')[0] : '',
            };
        }
        return {
            title: data.title || '',
            year: data.release_date ? data.release_date.split('-')[0] : '',
        };
    } catch (error) {
        console.error('[UHDMovies] TMDB fetch failed:', error.message);
        return null;
    }
}

// ─── Parsing Helpers ────────────────────────────────────────────────────────

/**
 * Extract a file size string like "2.5 GB" or "800 MB" from arbitrary text.
 * @param {string} text
 * @returns {string|null}
 */
function parseSize(text) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    return match ? `${match[1]} ${match[2].toUpperCase()}` : null;
}

/**
 * Determine video quality from text containing resolution keywords.
 * Falls back to "720p" if nothing recognizable is found.
 * @param {string} text
 * @returns {string}
 */
function parseQuality(text) {
    const t = text.toUpperCase();
    if (/4K|2160P|UHD/.test(t)) return '2160p';
    if (/1080P|FHD/.test(t))    return '1080p';
    if (/720P|HD/.test(t))      return '720p';
    if (/480P|SD/.test(t))      return '480p';
    return '720p';
}

/**
 * Determine the source tag (WEB-DL, BluRay, etc.) from text.
 * @param {string} text
 * @returns {string}
 */
function parseSourceTag(text) {
    const t = text.toUpperCase();
    if (/BLU-?RAY|BDRIP|BDREMUX/.test(t)) return 'BluRay';
    if (/WEB-?DL/.test(t))                return 'WEB-DL';
    if (/WEB-?RIP/.test(t))               return 'WEBRip';
    if (/HDR(?:10)?/.test(t))              return 'HDR';
    if (/REMUX/.test(t))                   return 'Remux';
    return '';
}

// ─── Link Bypass (unblockedgames redirect protector) ────────────────────────

/**
 * UHDMovies wraps many download links through an "unblockedgames" redirect
 * protector that requires form POSTs to reveal the final URL.
 *
 * This function walks through the 2-form POST chain and extracts the
 * final destination URL (usually a driveseed / GDrive / hubcloud link).
 *
 * @param {string} sidUrl - The initial redirect protector URL
 * @returns {Promise<string>} The resolved final URL, or the original if bypass fails
 */
async function bypassRedirectProtector(sidUrl) {
    try {
        // ── Step 1: Load initial page and submit first form ─────────
        const res = await fetch(sidUrl, {
            headers: { 'User-Agent': USER_AGENT },
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        const form0 = $('form#landing');
        const form0Action = form0.attr('action') || sidUrl;
        const form0Inputs = {};
        form0.find('input').each((_, inp) => {
            form0Inputs[$(inp).attr('name')] = $(inp).attr('value') || '';
        });

        if (!form0Inputs['_wp_http']) return sidUrl;

        // ── Step 2: POST first form, get second form ────────────────
        const postRes = await fetch(form0Action, {
            method: 'POST',
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(form0Inputs).toString(),
        });
        const postHtml = await postRes.text();
        const $post = cheerio.load(postHtml);

        const form1 = $post('form#landing');
        const form1Action = form1.attr('action');
        const form1Inputs = {};
        form1.find('input').each((_, inp) => {
            form1Inputs[$post(inp).attr('name')] = $post(inp).attr('value') || '';
        });

        if (!form1Inputs['_wp_http2']) return sidUrl;

        // ── Step 3: POST second form, extract cookie from JS ────────
        const postRes2 = await fetch(form1Action, {
            method: 'POST',
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': form0Action,
            },
            body: new URLSearchParams(form1Inputs).toString(),
        });
        const postHtml2 = await postRes2.text();
        const $post2 = cheerio.load(postHtml2);

        // The page contains a JS call like: s_343('cookieName', 'cookieValue')
        let scriptContent = '';
        $post2('script').each((_, el) => {
            scriptContent += $post2(el).html() + '\n';
        });

        const cookieMatch = scriptContent.match(/s_343\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/);
        if (cookieMatch) {
            const cookieName = cookieMatch[1];
            const cookieValue = cookieMatch[2];
            const finalUrl = `https://cloud.unblockedgames.world/?go=${cookieName}`;

            // ── Step 4: Follow final redirect with cookie ───────────
            const finalRes = await fetch(finalUrl, {
                headers: {
                    'User-Agent': USER_AGENT,
                    'Cookie': `${cookieName}=${cookieValue}`,
                },
            });
            const finalHtml = await finalRes.text();
            const $final = cheerio.load(finalHtml);

            // The final page uses a <meta http-equiv="refresh"> to redirect
            const metaRefresh = $final('meta[http-equiv="refresh"]').attr('content');
            if (metaRefresh) {
                const urlMatch = metaRefresh.match(/url=([^"]+)/i);
                if (urlMatch) {
                    return urlMatch[1];
                }
            }
        }
    } catch (err) {
        console.log(`[UHDMovies] Bypass failed for ${sidUrl}: ${err.message}`);
    }

    return sidUrl;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Main scraper function called by Nuvio.
 *
 * @param {string}        tmdbId     - TMDB ID of the media (e.g. "550")
 * @param {string}        mediaType  - "movie" or "tv"
 * @param {number|string} seasonNum  - Season number (TV only)
 * @param {number|string} episodeNum - Episode number (TV only)
 * @returns {Promise<Array<object>>} Array of stream objects
 */
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        // ── 1. Resolve the current live domain ──────────────────────
        const domain = await resolveDomain();

        // ── 2. Get title + year from TMDB ───────────────────────────
        const media = await getMediaDetails(tmdbId, mediaType);
        if (!media || !media.title) {
            console.log('[UHDMovies] Could not resolve media details from TMDB');
            return [];
        }

        console.log(`[UHDMovies] Searching for: "${media.title}" (${media.year})`);

        // ── 3. Search UHDMovies ─────────────────────────────────────
        const cleanTitle = media.title.replace(/[^\w\s]/gi, '');
        const query = encodeURIComponent(`${cleanTitle} ${media.year}`);
        const searchUrl = `${domain}/?s=${query}`;

        const searchRes = await fetch(searchUrl, {
            headers: { 'User-Agent': USER_AGENT },
        });
        const searchHtml = await searchRes.text();
        const $ = cheerio.load(searchHtml);

        // Parse search result cards
        const results = [];
        $('article.gridlove-post, article, div.post').each((_, el) => {
            const $el = $(el);
            const titleRaw = $el.find('h1.sanket, h2.entry-title a, h2.title a').text().trim();
            const href = $el.find('div.entry-image > a, h2.entry-title a, a.post-image-link').attr('href');

            if (href && titleRaw) {
                results.push({ title: titleRaw, url: href });
            }
        });

        if (results.length === 0) {
            console.log(`[UHDMovies] No search results on ${domain}`);
            return [];
        }

        // ── 4. Title verification ───────────────────────────────────
        const bestPost = results[0];
        const searchedWords = media.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const matchedTitle = bestPost.title.toLowerCase();
        const isMatch = searchedWords.every(word => matchedTitle.includes(word));

        if (!isMatch) {
            console.log(`[UHDMovies] Best result "${bestPost.title}" doesn't match "${media.title}". Skipping.`);
            return [];
        }

        console.log(`[UHDMovies] Matched post: "${bestPost.title}"`);

        // ── 5. Fetch the movie page and extract download links ──────
        const postRes = await fetch(bestPost.url, {
            headers: { 'User-Agent': USER_AGENT },
        });
        const postHtml = await postRes.text();
        const $post = cheerio.load(postHtml);

        const rawStreams = [];

        // Pattern for download/redirect link URLs
        const linkPattern = /instant|drive|gdrive|sharer|kolop|hubdrive|appdrive|gdflix|vcloud|mdisk|unblockedgames|sid=|hubcloud|driveseed|filepress/i;

        // Pattern for Google Drive direct links
        const gdrivePattern = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?)/i;

        $post('a').each((_, el) => {
            const href = ($post(el).attr('href') || '').trim();
            if (!href || !href.startsWith('http')) return;

            const linkText = $post(el).text().trim();
            const parentText = $post(el).parent().text().trim();
            const contextText = `${linkText} ${parentText} ${bestPost.title}`;

            // Match download handler links OR direct Google Drive links
            if (linkPattern.test(href) || gdrivePattern.test(href)) {
                const quality = parseQuality(contextText);
                const size = parseSize(contextText) || 'Unknown';
                const sourceTag = parseSourceTag(contextText);

                const label = sourceTag ? `${quality} ${sourceTag}` : quality;

                rawStreams.push({
                    name: `UHDMovies · ${label}`,
                    title: `${bestPost.title.substring(0, 50)}${bestPost.title.length > 50 ? '…' : ''} [${size}]`,
                    url: href,
                    quality: quality,
                    size: size,
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Referer': domain + '/',
                    },
                    provider: 'uhdmovies',
                });
            }
        });

        console.log(`[UHDMovies] Found ${rawStreams.length} raw download links`);

        if (rawStreams.length === 0) return [];

        // ── 6. Resolve redirect-protector URLs ──────────────────────
        // Cap at 15 links to avoid overwhelming the device
        const toResolve = rawStreams.slice(0, 15);

        console.log(`[UHDMovies] Resolving up to ${toResolve.length} redirect links...`);

        const resolvedStreams = await Promise.all(
            toResolve.map(async (stream) => {
                if (/unblockedgames|sid=/i.test(stream.url)) {
                    const resolvedUrl = await bypassRedirectProtector(stream.url);
                    return { ...stream, url: resolvedUrl };
                }
                return stream;
            })
        );

        // ── 7. Filter out self-referencing / invalid links ──────────
        const finalStreams = resolvedStreams.filter((stream) => {
            const url = stream.url.toLowerCase();
            // Remove links that loop back to UHDMovies itself or category pages
            if (url.includes('uhdmovies')) return false;
            if (url.includes('/4k-movies/')) return false;
            if (url.includes('/category/')) return false;
            if (!url.startsWith('http')) return false;
            return true;
        });

        console.log(`[UHDMovies] Returning ${finalStreams.length} stream links`);
        return finalStreams;

    } catch (error) {
        console.error('[UHDMovies] Fatal scraper error:', error.message);
        return [];
    }
}

// ─── Export ─────────────────────────────────────────────────────────────────

module.exports = { getStreams };
