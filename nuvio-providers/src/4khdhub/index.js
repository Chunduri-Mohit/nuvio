/**
 * 4KHDHub Provider Scraper for Nuvio
 */

const cheerio = require('cheerio-without-node-native');

const BASE_URL = "https://4khdhub.link";
const DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let domainCache = { url: BASE_URL, ts: 0 };

// Dynamically fetch the latest working domain
async function getLatestDomain() {
    const now = Date.now();
    if (now - domainCache.ts < 3600000) return domainCache.url; // 1 hour cache
    
    try {
        const response = await fetch(DOMAINS_URL);
        const data = await response.json();
        if (data && data["4khdhub"]) {
            domainCache.url = data["4khdhub"];
            domainCache.ts = now;
        }
    } catch (e) {
        console.log("[4KHDHub] Domain fetch error, falling back to cache:", e.message);
    }
    return domainCache.url;
}

// Translate TMDB ID to Movie/Show Title and Year
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
        console.error("[4KHDHub] TMDB details fetch failed:", error.message);
        return null;
    }
}

// Extract stream size
function parseSize(text) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    return match ? `${match[1]} ${match[2].toUpperCase()}` : null;
}

// Extract resolution
function parseQuality(text) {
    if (text.match(/4k|2160p/i)) return "2160p";
    if (text.match(/1080p/i)) return "1080p";
    if (text.match(/720p/i)) return "720p";
    if (text.match(/480p/i)) return "480p";
    return "720p"; // default fallback
}

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        const domain = await getLatestDomain();
        const media = await getMediaDetails(tmdbId, mediaType);
        if (!media) return [];
        
        console.log(`[4KHDHub] Resolved details: Title="${media.title}", Year=${media.year}`);
        
        // Build search query: "Title Year"
        const searchWord = media.title.replace(/[^\w\s]/gi, '');
        const query = encodeURIComponent(`${searchWord} ${media.year}`);
        const searchUrl = `${domain}/?s=${query}`;
        
        const res = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } });
        const html = await res.text();
        console.log(`[4KHDHub debug] Search URL: ${searchUrl}`);
        console.log(`[4KHDHub debug] Status: ${res.status}, Length: ${html.length}`);
        if (html.includes("Cloudflare") || html.includes("Just a moment")) {
            console.log("[4KHDHub debug] Blocked by Cloudflare protection!");
        } else {
            console.log(`[4KHDHub debug] HTML Preview: ${html.substring(0, 400).replace(/\r?\n|\r/g, " ")}`);
        }
        const $ = cheerio.load(html);
        
        const searchResults = [];
        
        $('a').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            if (href.startsWith('http') && !href.includes('s=') && text) {
                console.log(`[4KHDHub debug search links] Link: "${text}", Href: ${href}`);
            }
        });
        
        // Parse search results cards (typically in h2.entry-title or article)
        $('article, div.post, div.entry-grid').each((_, el) => {
            const linkEl = $(el).find('h2.entry-title a, h2.title a, a.post-image-link');
            const href = linkEl.attr('href');
            const title = linkEl.text().trim() || $(el).find('h2.entry-title').text().trim();
            
            if (href && title) {
                searchResults.push({ title, url: href });
            }
        });
        
        if (searchResults.length === 0) {
            console.log(`[4KHDHub] No search results found for ${media.title}`);
            return [];
        }
        
        // Find best matching post (checking for title similarity)
        // Here we just pick the first result for simplicity, but a title check can be added
        const bestPost = searchResults[0];
        console.log(`[4KHDHub] Fetching links from post: ${bestPost.title}`);
        
        const postRes = await fetch(bestPost.url, { headers: { 'User-Agent': USER_AGENT } });
        const postHtml = await postRes.text();
        const $post = cheerio.load(postHtml);
        
        const streams = [];
        
        // Extract links: 4KHDHub pages contain links inside table rows, pre tags, or buttons.
        // Links usually point to hubdrive, gdrive, gdtot, appdrive, etc.
        $post('a').each((_, el) => {
            const href = $post(el).attr('href') || '';
            const text = $post(el).text().trim() || $post(el).parent().text().trim();
            
            // Look for link resolvers or direct links
            if (href.match(/hubdrive|gdrive|gdtot|appdrive|gdflix|drive|sharer|kolop|unblockedgames|sid=/i)) {
                const quality = parseQuality(text + " " + bestPost.title);
                const size = parseSize(text) || "Unknown Size";
                
                streams.push({
                    name: `4KHDHub (${quality})`,
                    title: `${bestPost.title.substring(0, 40)}... [${size}]`,
                    url: href,
                    quality: quality,
                    size: size,
                    provider: "4khdhub"
                });
            }
        });
        
        console.log(`[4KHDHub] Extracted ${streams.length} stream links`);
        return streams;
        
    } catch (error) {
        console.error("[4KHDHub] Scraper error:", error.message);
        return [];
    }
}

module.exports = { getStreams };
