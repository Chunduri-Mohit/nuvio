/**
 * UHDMovies Scraper Provider for Nuvio
 */

const cheerio = require('cheerio-without-node-native');

const BASE_URL = "https://uhdmovies.rodeo";
const DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let domainCache = { url: BASE_URL, ts: 0 };

async function getLatestDomain() {
    const now = Date.now();
    if (now - domainCache.ts < 3600000) return domainCache.url;
    
    try {
        const response = await fetch(DOMAINS_URL);
        const data = await response.json();
        if (data && data["UHDMovies"]) {
            domainCache.url = data["UHDMovies"];
            domainCache.ts = now;
        }
    } catch (e) {
        console.log("[UHDMovies] Domain fetch error:", e.message);
    }
    return domainCache.url;
}

async function getMediaDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `https://api.tmdb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (mediaType === 'tv') {
            return {
                title: data.name,
                year: data.first_air_date ? data.first_air_date.split('-')[0] : ''
            };
        } else {
            return {
                title: data.title,
                year: data.release_date ? data.release_date.split('-')[0] : ''
            };
        }
    } catch (error) {
        console.error("[UHDMovies] TMDB details fetch failed:", error.message);
        return null;
    }
}

function parseSize(text) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    return match ? `${match[1]} ${match[2].toUpperCase()}` : null;
}

function parseQuality(text) {
    if (text.match(/4k|2160p/i)) return "2160p";
    if (text.match(/1080p/i)) return "1080p";
    if (text.match(/720p/i)) return "720p";
    if (text.match(/480p/i)) return "480p";
    return "720p";
}

// Bypasses the unblockedgames redirect protector to get the final driveseed/download URL
async function bypassUnblockedGames(sidUrl) {
    try {
        const res = await fetch(sidUrl, { headers: { "User-Agent": USER_AGENT } });
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const form0 = $('form#landing');
        const form0Action = form0.attr('action') || sidUrl;
        const form0Inputs = {};
        form0.find('input').each((_, inp) => {
            form0Inputs[$(inp).attr('name')] = $(inp).attr('value') || '';
        });
        
        if (!form0Inputs['_wp_http']) return sidUrl;
        
        const postRes = await fetch(form0Action, {
            method: "POST",
            headers: {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams(form0Inputs).toString()
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
        
        const postRes2 = await fetch(form1Action, {
            method: "POST",
            headers: {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": form0Action
            },
            body: new URLSearchParams(form1Inputs).toString()
        });
        const postHtml2 = await postRes2.text();
        const $post2 = cheerio.load(postHtml2);
        
        let scriptContent = '';
        $post2('script').each((_, el) => {
            scriptContent += $post2(el).html() + '\n';
        });
        
        const match = scriptContent.match(/s_343\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/);
        if (match) {
            const cookieName = match[1];
            const cookieValue = match[2];
            const finalUrl = `https://cloud.unblockedgames.world/?go=${cookieName}`;
            
            const finalRes = await fetch(finalUrl, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Cookie": `${cookieName}=${cookieValue}`
                }
            });
            const finalHtml = await finalRes.text();
            const $final = cheerio.load(finalHtml);
            
            const metaRefresh = $final('meta[http-equiv="refresh"]').attr('content');
            if (metaRefresh) {
                const urlMatch = metaRefresh.match(/url=([^"]+)/i);
                if (urlMatch) {
                    return urlMatch[1];
                }
            }
        }
    } catch (err) {
        console.log(`[UHDMovies bypasser] Failed resolving ${sidUrl}: ${err.message}`);
    }
    return sidUrl;
}

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        const domain = await getLatestDomain();
        const media = await getMediaDetails(tmdbId, mediaType);
        if (!media) return [];
        
        console.log(`[UHDMovies] Resolved details: Title="${media.title}", Year=${media.year}`);
        
        const cleanQuery = media.title.replace(/[^\w\s]/gi, '');
        const query = encodeURIComponent(`${cleanQuery} ${media.year}`);
        const searchUrl = `${domain}/?s=${query}`;
        
        const res = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } });
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const results = [];
        
        $('article.gridlove-post').each((_, el) => {
            const $el = $(el);
            const titleRaw = $el.find('h1.sanket, h2.entry-title a').text().trim();
            const href = $el.find('div.entry-image > a, h2.entry-title a').attr('href');
            
            if (href && titleRaw) {
                results.push({ title: titleRaw, url: href });
            }
        });
        
        if (results.length === 0) {
            console.log(`[UHDMovies] No search results found on ${domain}`);
            return [];
        }
        
        // Pick best matching post
        const bestPost = results[0];
        
        // Title verification check
        const searchedTitle = media.title.toLowerCase();
        const matchedTitle = bestPost.title.toLowerCase();
        const searchWords = searchedTitle.split(/\s+/).filter(w => w.length > 2);
        const isMatched = searchWords.every(word => matchedTitle.includes(word));
        
        if (!isMatched) {
            console.log(`[UHDMovies] Matched post "${bestPost.title}" does not overlap enough with searched title "${media.title}". Ignoring.`);
            return [];
        }
        
        console.log(`[UHDMovies] Extracting links from post: ${bestPost.title}`);
        
        const postRes = await fetch(bestPost.url, { headers: { 'User-Agent': USER_AGENT } });
        const postHtml = await postRes.text();
        const $post = cheerio.load(postHtml);
        
        const rawStreams = [];
        
        $post('a').each((_, el) => {
            const href = $post(el).attr('href') || '';
            const text = $post(el).text().trim() || $post(el).parent().text().trim();
            
            if (href.match(/instant|drive|gdrive|sharer|kolop|hubdrive|appdrive|gdflix|vcloud|mdisk|unblockedgames|sid=/i)) {
                const quality = parseQuality(text + " " + bestPost.title);
                const size = parseSize(text) || "Unknown Size";
                
                rawStreams.push({
                    name: `UHDMovies (${quality})`,
                    title: `${bestPost.title.substring(0, 35)}... [${size}]`,
                    url: href,
                    quality: quality,
                    size: size,
                    provider: "uhdmovies"
                });
            }
        });
        
        console.log(`[UHDMovies] Found ${rawStreams.length} raw links. Resolving redirects...`);
        
        // Limit to first 12 raw links to prevent overloading network
        const linksToResolve = rawStreams.slice(0, 12);
        
        // Resolve link protector URLs in parallel
        const resolvedStreams = await Promise.all(linksToResolve.map(async (stream) => {
            if (stream.url.includes('unblockedgames') || stream.url.includes('sid=')) {
                const resolvedUrl = await bypassUnblockedGames(stream.url);
                return { ...stream, url: resolvedUrl };
            }
            return stream;
        }));
        
        // Filter out category redirects (e.g. uhdmovies.mov/4k-movies/) and invalid links
        const finalStreams = resolvedStreams.filter(stream => {
            const url = stream.url.toLowerCase();
            return !url.includes('uhdmovies') && !url.includes('/4k-movies/') && url.startsWith('http');
        });
        
        console.log(`[UHDMovies] Returning ${finalStreams.length} resolved stream links`);
        return finalStreams;
        
    } catch (e) {
        console.error("[UHDMovies] Scraper error:", e.message);
        return [];
    }
}

module.exports = { getStreams };
