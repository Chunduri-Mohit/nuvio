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
var BASE_URL = "https://uhdmovies.rodeo";
var DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var domainCache = { url: BASE_URL, ts: 0 };
function getLatestDomain() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (now - domainCache.ts < 36e5)
      return domainCache.url;
    try {
      const response = yield fetch(DOMAINS_URL);
      const data = yield response.json();
      if (data && data["UHDMovies"]) {
        domainCache.url = data["UHDMovies"];
        domainCache.ts = now;
      }
    } catch (e) {
      console.log("[UHDMovies] Domain fetch error:", e.message);
    }
    return domainCache.url;
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
          title: data.name,
          year: data.first_air_date ? data.first_air_date.split("-")[0] : ""
        };
      } else {
        return {
          title: data.title,
          year: data.release_date ? data.release_date.split("-")[0] : ""
        };
      }
    } catch (error) {
      console.error("[UHDMovies] TMDB details fetch failed:", error.message);
      return null;
    }
  });
}
function parseSize(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  return match ? `${match[1]} ${match[2].toUpperCase()}` : null;
}
function parseQuality(text) {
  if (text.match(/4k|2160p/i))
    return "2160p";
  if (text.match(/1080p/i))
    return "1080p";
  if (text.match(/720p/i))
    return "720p";
  if (text.match(/480p/i))
    return "480p";
  return "720p";
}
function bypassUnblockedGames(sidUrl) {
  return __async(this, null, function* () {
    try {
      const res = yield fetch(sidUrl, { headers: { "User-Agent": USER_AGENT } });
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
      const match = scriptContent.match(/s_343\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/);
      if (match) {
        const cookieName = match[1];
        const cookieValue = match[2];
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
      console.log(`[UHDMovies bypasser] Failed resolving ${sidUrl}: ${err.message}`);
    }
    return sidUrl;
  });
}
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    try {
      const domain = yield getLatestDomain();
      const media = yield getMediaDetails(tmdbId, mediaType);
      if (!media)
        return [];
      console.log(`[UHDMovies] Resolved details: Title="${media.title}", Year=${media.year}`);
      const cleanQuery = media.title.replace(/[^\w\s]/gi, "");
      const query = encodeURIComponent(`${cleanQuery} ${media.year}`);
      const searchUrl = `${domain}/?s=${query}`;
      const res = yield fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } });
      const html = yield res.text();
      const $ = cheerio.load(html);
      const results = [];
      $("article.gridlove-post").each((_, el) => {
        const $el = $(el);
        const titleRaw = $el.find("h1.sanket, h2.entry-title a").text().trim();
        const href = $el.find("div.entry-image > a, h2.entry-title a").attr("href");
        if (href && titleRaw) {
          results.push({ title: titleRaw, url: href });
        }
      });
      if (results.length === 0) {
        console.log(`[UHDMovies] No search results found on ${domain}`);
        return [];
      }
      const bestPost = results[0];
      const searchedTitle = media.title.toLowerCase();
      const matchedTitle = bestPost.title.toLowerCase();
      const searchWords = searchedTitle.split(/\s+/).filter((w) => w.length > 2);
      const isMatched = searchWords.every((word) => matchedTitle.includes(word));
      if (!isMatched) {
        console.log(`[UHDMovies] Matched post "${bestPost.title}" does not overlap enough with searched title "${media.title}". Ignoring.`);
        return [];
      }
      console.log(`[UHDMovies] Extracting links from post: ${bestPost.title}`);
      const postRes = yield fetch(bestPost.url, { headers: { "User-Agent": USER_AGENT } });
      const postHtml = yield postRes.text();
      const $post = cheerio.load(postHtml);
      const rawStreams = [];
      $post("a").each((_, el) => {
        const href = $post(el).attr("href") || "";
        const text = $post(el).text().trim() || $post(el).parent().text().trim();
        if (href.match(/instant|drive|gdrive|sharer|kolop|hubdrive|appdrive|gdflix|vcloud|mdisk|unblockedgames|sid=/i)) {
          const quality = parseQuality(text + " " + bestPost.title);
          const size = parseSize(text) || "Unknown Size";
          rawStreams.push({
            name: `UHDMovies (${quality})`,
            title: `${bestPost.title.substring(0, 35)}... [${size}]`,
            url: href,
            quality,
            size,
            provider: "uhdmovies"
          });
        }
      });
      console.log(`[UHDMovies] Found ${rawStreams.length} raw links. Resolving redirects...`);
      const linksToResolve = rawStreams.slice(0, 12);
      const resolvedStreams = yield Promise.all(linksToResolve.map((stream) => __async(this, null, function* () {
        if (stream.url.includes("unblockedgames") || stream.url.includes("sid=")) {
          const resolvedUrl = yield bypassUnblockedGames(stream.url);
          return __spreadProps(__spreadValues({}, stream), { url: resolvedUrl });
        }
        return stream;
      })));
      const finalStreams = resolvedStreams.filter((stream) => {
        const url = stream.url.toLowerCase();
        return !url.includes("uhdmovies") && !url.includes("/4k-movies/") && url.startsWith("http");
      });
      console.log(`[UHDMovies] Returning ${finalStreams.length} resolved stream links`);
      return finalStreams;
    } catch (e) {
      console.error("[UHDMovies] Scraper error:", e.message);
      return [];
    }
  });
}
module.exports = { getStreams };
