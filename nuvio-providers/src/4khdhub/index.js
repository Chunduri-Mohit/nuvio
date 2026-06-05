/**
 * 4KHDHub Provider Scraper for Nuvio
 */

const cheerio = require('cheerio-without-node-native');

const BASE_URL = "https://4khdhub.link";
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
        if (data && data["4khdhub"]) {
            domainCache.url = data["4khdhub"];
            domainCache.ts = now;
        }
    } catch (e) {
        console.log("[4KHDHub] Domain fetch error:", e.message);
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
        console.error("[4KHDHub] TMDB details fetch failed:", error.message);
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
        console.log(`[4KHDHub bypasser] Failed resolving ${sidUrl}: ${err.message}`);
    }
    return sidUrl;
}

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        const domain = await getLatestDomain();
        const media = await getMediaDetails(tmdbId, mediaType);
        if (!media) return [];
        
        console.log(`[4KHDHub] Resolved details: Title="${media.title}", Year=${media.year}`);
        
        const searchWord = media.title.replace(/[^\w\s]/gi, '');
        const query = encodeURIComponent(`${searchWord} ${media.year}`);
        const searchUrl = `${domain}/?s=${query}`;
        
        const res = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } });
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const searchResults = [];
        
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
        
        const bestPost = searchResults[0];
        
        // Title verification check
        const searchedTitle = media.title.toLowerCase();
        const matchedTitle = bestPost.title.toLowerCase();
        const searchWords = searchedTitle.split(/\s+/).filter(w => w.length > 2);
        const isMatched = searchWords.every(word => matchedTitle.includes(word));
        
        if (!isMatched) {
            console.log(`[4KHDHub] Matched post "${bestPost.title}" does not contain searched title "${media.title}". Ignoring.`);
            return [];
        }
        
        console.log(`[4KHDHub] Fetching links from post: ${bestPost.title}`);
        
        const postRes = await fetch(bestPost.url, { headers: { 'User-Agent': USER_AGENT } });
        const postHtml = await postRes.text();
        const $post = cheerio.load(postHtml);
        
        const rawStreams = [];
        
        $post('a').each((_, el) => {
            const href = $post(el).attr('href') || '';
            const text = $post(el).text().trim() || $post(el).parent().text().trim();
            
            if (href.match(/hubdrive|gdrive|gdtot|appdrive|gdflix|drive|sharer|kolop|unblockedgames|sid=/i)) {
                const quality = parseQuality(text + " " + bestPost.title);
                const size = parseSize(text) || "Unknown Size";
                
                rawStreams.push({
                    name: `4KHDHub (${quality})`,
                    title: `${bestPost.title.substring(0, 40)}... [${size}]`,
                    url: href,
                    quality: quality,
                    size: size,
                    provider: "4khdhub"
                });
            }
        });
        
        console.log(`[4KHDHub] Found ${rawStreams.length} raw links. Resolving redirects...`);
        
        const linksToResolve = rawStreams.slice(0, 12);
        
        const resolvedStreams = await Promise.all(linksToResolve.map(async (stream) => {
            if (stream.url.includes('unblockedgames') || stream.url.includes('sid=')) {
                const resolvedUrl = await bypassUnblockedGames(stream.url);
                return { ...stream, url: resolvedUrl };
            }
            return stream;
        }));
        
        const finalStreams = resolvedStreams.filter(stream => {
            const url = stream.url.toLowerCase();
            return !url.includes('4khdhub') && !url.includes('/4k-movies/') && url.startsWith('http');
        });
        
        console.log(`[4KHDHub] Returning ${finalStreams.length} resolved stream links`);
        return finalStreams;
        
    } catch (error) {
        console.error("[4KHDHub] Scraper error:", error.message);
        return [];
    }
}

module.exports = { getStreams };
