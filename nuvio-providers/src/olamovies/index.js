/**
 * OlaMovies Scraper Provider for Nuvio
 */

const cheerio = require('cheerio-without-node-native');

const BASE_URL = "https://olamovies.dad";
const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let domainCache = { url: BASE_URL, ts: 0 };

async function getLatestDomain() {
    // By default uses olamovies.dad.
    // If the domain changes, you can add a dynamic fetch resolver here.
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
        console.error("[OlaMovies] TMDB details fetch failed:", error.message);
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
    return "1080p"; // OlaMovies specializes in high-quality HDR/60FPS streams
}

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        const domain = await getLatestDomain();
        const media = await getMediaDetails(tmdbId, mediaType);
        if (!media) return [];
        
        console.log(`[OlaMovies] Resolved details: Title="${media.title}", Year=${media.year}`);
        
        const cleanQuery = media.title.replace(/[^\w\s]/gi, '');
        const query = encodeURIComponent(`${cleanQuery} ${media.year}`);
        const searchUrl = `${domain}/?s=${query}`;
        
        const res = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } });
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const results = [];
        
        // Parse search results card (often in .post, .entry, or article elements)
        $('article, div.post, div.entry-post').each((_, el) => {
            const linkEl = $(el).find('h2.entry-title a, h2.title a, a');
            const href = linkEl.attr('href');
            const title = linkEl.text().trim() || $(el).find('h2').text().trim();
            
            if (href && href.includes('/m/') && title) {
                results.push({ title, url: href });
            }
        });
        
        if (results.length === 0) {
            // Fallback general link match if specific tags fail
            $('a').each((_, el) => {
                const href = $(el).attr('href') || '';
                const title = $(el).text().trim();
                if (href.match(/\/movies\/|\/shows\/|\/m\//i) && title.toLowerCase().includes(media.title.toLowerCase())) {
                    results.push({ title, url: href });
                }
            });
        }
        
        if (results.length === 0) {
            console.log(`[OlaMovies] No search results found for ${media.title}`);
            return [];
        }
        
        // Take the best matching result
        const bestPost = results[0];
        console.log(`[OlaMovies] Extracting links from post: ${bestPost.title} (${bestPost.url})`);
        
        const postRes = await fetch(bestPost.url, { headers: { 'User-Agent': USER_AGENT } });
        const postHtml = await postRes.text();
        const $post = cheerio.load(postHtml);
        
        const streams = [];
        
        // Search for download links (e.g. direct GDrive, 60fps high frame rate links, Mega, etc.)
        $post('a').each((_, el) => {
            const href = $post(el).attr('href') || '';
            const text = $post(el).text().trim() || $post(el).parent().text().trim();
            
            if (href.match(/drive|megaup|mega|gdrive|gdtot|kolop|sharer|hubdrive|appdrive|gdflix/i)) {
                const quality = parseQuality(text + " " + bestPost.title);
                const size = parseSize(text) || "HDR / 60FPS";
                
                streams.push({
                    name: `OlaMovies (${quality})`,
                    title: `${bestPost.title.substring(0, 45)}... [${size}]`,
                    url: href,
                    quality: quality,
                    size: size,
                    provider: "olamovies"
                });
            }
        });
        
        console.log(`[OlaMovies] Found ${streams.length} stream links`);
        return streams;
        
    } catch (e) {
        console.error("[OlaMovies] Scraper error:", e.message);
        return [];
    }
}

module.exports = { getStreams };
