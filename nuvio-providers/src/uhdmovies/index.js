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
        
        // Match article.gridlove-post structure
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
        
        // Use first result as matching post
        const bestPost = results[0];
        console.log(`[UHDMovies] Extracting links from post: ${bestPost.title}`);
        
        const postRes = await fetch(bestPost.url, { headers: { 'User-Agent': USER_AGENT } });
        const postHtml = await postRes.text();
        const $post = cheerio.load(postHtml);
        
        const streams = [];
        
        // UHDMovies formats downloads/streams inside styled tables or links.
        // We'll traverse all anchor tags on the page looking for standard download links.
        $post('a').each((_, el) => {
            const href = $post(el).attr('href') || '';
            const text = $post(el).text().trim() || $post(el).parent().text().trim();
            
            if (href.startsWith('http') && !href.includes('uhdmovies') && !href.includes('facebook') && !href.includes('twitter') && !href.includes('telegram')) {
                console.log(`[UHDMovies debug] Text: "${text.substring(0, 30)}", Href: ${href}`);
            }
            
            if (href.match(/instant|drive|gdrive|sharer|kolop|hubdrive|appdrive|gdflix|vcloud|mdisk|unblockedgames|sid=/i)) {
                const quality = parseQuality(text + " " + bestPost.title);
                const size = parseSize(text) || "Unknown Size";
                
                streams.push({
                    name: `UHDMovies (${quality})`,
                    title: `${bestPost.title.substring(0, 45)}... [${size}]`,
                    url: href,
                    quality: quality,
                    size: size,
                    provider: "uhdmovies"
                });
            }
        });
        
        console.log(`[UHDMovies] Found ${streams.length} links`);
        return streams;
        
    } catch (e) {
        console.error("[UHDMovies] Scraper error:", e.message);
        return [];
    }
}

module.exports = { getStreams };
