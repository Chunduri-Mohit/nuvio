var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/uhdmovies/index.js
var cheerio = require("cheerio-without-node-native");
var TMDB_API_KEY = "66a4be2c09e7a3191882b870f449b58a";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
var KNOWN_DOMAINS = [
  "https://uhdmovies.rodeo",
  "https://uhdmovies.pink",
  "https://uhdmovies.mov",
  "https://uhdmovies.ink",
  "https://uhdmovies.dad",
  "https://uhdmovies.foo",
  "https://uhdmovies.lat",
  "https://uhdmovies.life",
  "https://uhdmovies.work",
  "https://uhdmovies.quest",
  "https://uhdmovies.shop",
  "https://uhdmovies.store",
  "https://uhdmovies.day",
  "https://uhdmovies.world",
  "https://uhdmovies.org.in",
  "https://uhdmovies.cfd",
  "https://uhdmovies.sbs"
];
var domainCache = { url: null, ts: 0 };
var CACHE_TTL = 60 * 60 * 1e3;
function resolveDomain() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (domainCache.url && now - domainCache.ts < CACHE_TTL) {
      return domainCache.url;
    }
    let resolved = null;
    try {
      console.log("[UHDMovies] Resolving domain via DuckDuckGo...");
      const ddgUrl = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent("uhdmovies 4k dual audio");
      const ddgRes = yield fetch(ddgUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html"
        }
      });
      const ddgHtml = yield ddgRes.text();
      const domainRegex = /https?:\/\/uhdmovies\.[a-z.]{2,10}/gi;
      const matches = ddgHtml.match(domainRegex);
      if (matches && matches.length > 0) {
        const unique = [...new Set(matches.map((m) => m.toLowerCase().replace(/\/$/, "")))];
        resolved = unique[0];
        console.log(`[UHDMovies] DuckDuckGo resolved domain: ${resolved}`);
      }
    } catch (err) {
      console.log("[UHDMovies] DuckDuckGo resolution failed:", err.message);
    }
    if (!resolved) {
      console.log("[UHDMovies] Falling back to known-domain probing...");
      for (const candidate of KNOWN_DOMAINS) {
        try {
          const probeRes = yield fetch(candidate, {
            method: "HEAD",
            headers: { "User-Agent": USER_AGENT },
            redirect: "follow"
          });
          if (probeRes.status < 400) {
            resolved = candidate;
            console.log(`[UHDMovies] Probe hit: ${candidate} (${probeRes.status})`);
            break;
          }
        } catch (_) {
        }
      }
    }
    if (!resolved) {
      resolved = KNOWN_DOMAINS[0];
      console.log(`[UHDMovies] All resolution failed. Using fallback: ${resolved}`);
    }
    domainCache = { url: resolved, ts: now };
    return resolved;
  });
}
function getMediaDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const url = `https://api.tmdb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    try {
      const response = yield fetch(url);
      const data = yield response.json();
      if (mediaType === "tv") {
        return {
          title: data.name || "",
          year: data.first_air_date ? data.first_air_date.split("-")[0] : ""
        };
      }
      return {
        title: data.title || "",
        year: data.release_date ? data.release_date.split("-")[0] : ""
      };
    } catch (error) {
      console.error("[UHDMovies] TMDB fetch failed:", error.message);
      return null;
    }
  });
}
function parseSize(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  return match ? `${match[1]} ${match[2].toUpperCase()}` : null;
}
function parseQuality(text) {
  const t = text.toUpperCase();
  if (/4K|2160P|UHD/.test(t))
    return "2160p";
  if (/1080P|FHD/.test(t))
    return "1080p";
  if (/720P|HD/.test(t))
    return "720p";
  if (/480P|SD/.test(t))
    return "480p";
  return "720p";
}
function parseSourceTag(text) {
  const t = text.toUpperCase();
  if (/BLU-?RAY|BDRIP|BDREMUX/.test(t))
    return "BluRay";
  if (/WEB-?DL/.test(t))
    return "WEB-DL";
  if (/WEB-?RIP/.test(t))
    return "WEBRip";
  if (/HDR(?:10)?/.test(t))
    return "HDR";
  if (/REMUX/.test(t))
    return "Remux";
  return "";
}
function bypassRedirectProtector(sidUrl) {
  return __async(this, null, function* () {
    try {
      const res = yield fetch(sidUrl, {
        headers: { "User-Agent": USER_AGENT }
      });
      const html = yield res.text();
      const $ = cheerio.load(html);
      const form0 = $("form#landing");
      const form0Action = form0.attr("action") || sidUrl;
      const form0Inputs = {};
      form0.find("input").each((_, inp) => {
        form0Inputs[$(inp).attr("name")] = $(inp).attr("value") || "";
      });
      if (!form0Inputs["_wp_http"])
        return sidUrl;
      const postRes = yield fetch(form0Action, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(form0Inputs).toString()
      });
      const postHtml = yield postRes.text();
      const $post = cheerio.load(postHtml);
      const form1 = $post("form#landing");
      const form1Action = form1.attr("action");
      const form1Inputs = {};
      form1.find("input").each((_, inp) => {
        form1Inputs[$post(inp).attr("name")] = $post(inp).attr("value") || "";
      });
      if (!form1Inputs["_wp_http2"])
        return sidUrl;
      const postRes2 = yield fetch(form1Action, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": form0Action
        },
        body: new URLSearchParams(form1Inputs).toString()
      });
      const postHtml2 = yield postRes2.text();
      const $post2 = cheerio.load(postHtml2);
      let scriptContent = "";
      $post2("script").each((_, el) => {
        scriptContent += $post2(el).html() + "\n";
      });
      const cookieMatch = scriptContent.match(/s_343\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/);
      if (cookieMatch) {
        const cookieName = cookieMatch[1];
        const cookieValue = cookieMatch[2];
        const finalUrl = `https://cloud.unblockedgames.world/?go=${cookieName}`;
        const finalRes = yield fetch(finalUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Cookie": `${cookieName}=${cookieValue}`
          }
        });
        const finalHtml = yield finalRes.text();
        const $final = cheerio.load(finalHtml);
        const metaRefresh = $final('meta[http-equiv="refresh"]').attr("content");
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
  });
}
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    try {
      const domain = yield resolveDomain();
      const media = yield getMediaDetails(tmdbId, mediaType);
      if (!media || !media.title) {
        console.log("[UHDMovies] Could not resolve media details from TMDB");
        return [];
      }
      console.log(`[UHDMovies] Searching for: "${media.title}" (${media.year})`);
      const cleanTitle = media.title.replace(/[^\w\s]/gi, "");
      const query = encodeURIComponent(`${cleanTitle} ${media.year}`);
      const searchUrl = `${domain}/?s=${query}`;
      const searchRes = yield fetch(searchUrl, {
        headers: { "User-Agent": USER_AGENT }
      });
      const searchHtml = yield searchRes.text();
      const $ = cheerio.load(searchHtml);
      const results = [];
      $("article.gridlove-post, article, div.post").each((_, el) => {
        const $el = $(el);
        const titleRaw = $el.find("h1.sanket, h2.entry-title a, h2.title a").text().trim();
        const href = $el.find("div.entry-image > a, h2.entry-title a, a.post-image-link").attr("href");
        if (href && titleRaw) {
          results.push({ title: titleRaw, url: href });
        }
      });
      if (results.length === 0) {
        console.log(`[UHDMovies] No search results on ${domain}`);
        return [];
      }
      const bestPost = results[0];
      const searchedWords = media.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const matchedTitle = bestPost.title.toLowerCase();
      const isMatch = searchedWords.every((word) => matchedTitle.includes(word));
      if (!isMatch) {
        console.log(`[UHDMovies] Best result "${bestPost.title}" doesn't match "${media.title}". Skipping.`);
        return [];
      }
      console.log(`[UHDMovies] Matched post: "${bestPost.title}"`);
      const postRes = yield fetch(bestPost.url, {
        headers: { "User-Agent": USER_AGENT }
      });
      const postHtml = yield postRes.text();
      const $post = cheerio.load(postHtml);
      const rawStreams = [];
      const linkPattern = /instant|drive|gdrive|sharer|kolop|hubdrive|appdrive|gdflix|vcloud|mdisk|unblockedgames|sid=|hubcloud|driveseed|filepress/i;
      const gdrivePattern = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?)/i;
      $post("a").each((_, el) => {
        const href = ($post(el).attr("href") || "").trim();
        if (!href || !href.startsWith("http"))
          return;
        const linkText = $post(el).text().trim();
        const parentText = $post(el).parent().text().trim();
        const contextText = `${linkText} ${parentText} ${bestPost.title}`;
        if (linkPattern.test(href) || gdrivePattern.test(href)) {
          const quality = parseQuality(contextText);
          const size = parseSize(contextText) || "Unknown";
          const sourceTag = parseSourceTag(contextText);
          const label = sourceTag ? `${quality} ${sourceTag}` : quality;
          rawStreams.push({
            name: `UHDMovies \xB7 ${label}`,
            title: `${bestPost.title.substring(0, 50)}${bestPost.title.length > 50 ? "\u2026" : ""} [${size}]`,
            url: href,
            quality,
            size,
            headers: {
              "User-Agent": USER_AGENT,
              "Referer": domain + "/"
            },
            provider: "uhdmovies"
          });
        }
      });
      console.log(`[UHDMovies] Found ${rawStreams.length} raw download links`);
      if (rawStreams.length === 0)
        return [];
      const toResolve = rawStreams.slice(0, 15);
      console.log(`[UHDMovies] Resolving up to ${toResolve.length} redirect links...`);
      const resolvedStreams = yield Promise.all(
        toResolve.map((stream) => __async(this, null, function* () {
          if (/unblockedgames|sid=/i.test(stream.url)) {
            const resolvedUrl = yield bypassRedirectProtector(stream.url);
            return __spreadProps(__spreadValues({}, stream), { url: resolvedUrl });
          }
          return stream;
        }))
      );
      const finalStreams = resolvedStreams.filter((stream) => {
        const url = stream.url.toLowerCase();
        if (url.includes("uhdmovies"))
          return false;
        if (url.includes("/4k-movies/"))
          return false;
        if (url.includes("/category/"))
          return false;
        if (!url.startsWith("http"))
          return false;
        return true;
      });
      console.log(`[UHDMovies] Returning ${finalStreams.length} stream links`);
      return finalStreams;
    } catch (error) {
      console.error("[UHDMovies] Fatal scraper error:", error.message);
      return [];
    }
  });
}
module.exports = { getStreams };
