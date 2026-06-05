/**
 * 4khdhub - Built from src/4khdhub/
 * Generated: 2026-06-05T00:00:00.000Z
 */
"use strict";
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

// src/4khdhub/constants.js
var cheerio = require("cheerio-without-node-native");
var BASE_URL = "https://4khdhub.link";
var DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// src/4khdhub/utils.js
var domainCache = { url: BASE_URL, ts: 0 };
function getLatestDomain() {
  return __async(this, null, function* () {
    var now = Date.now();
    if (now - domainCache.ts < 36e5) return domainCache.url;
    try {
      var response = yield fetch(DOMAINS_URL);
      var data = yield response.json();
      if (data && data["4khdhub"]) {
        domainCache.url = data["4khdhub"];
        domainCache.ts = now;
      }
    } catch (e) {
      console.log("[4KHDHub] Domain fetch error:", e.message);
    }
    return domainCache.url;
  });
}

// src/4khdhub/tmdb.js
function getMediaDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var isSeries = mediaType === "series" || mediaType === "tv";
    var endpoint = isSeries ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
    console.log("[4KHDHub] Fetching TMDB details from: " + url);
    try {
      var response = yield fetch(url);
      var data = yield response.json();
      if (isSeries) {
        return {
          title: data.name,
          year: data.first_air_date ? parseInt(data.first_air_date.split("-")[0]) : 0
        };
      } else {
        return {
          title: data.title,
          year: data.release_date ? parseInt(data.release_date.split("-")[0]) : 0
        };
      }
    } catch (error) {
      console.log("[4KHDHub] TMDB request failed: " + error.message);
      return null;
    }
  });
}

// src/4khdhub/utils.js
function parseSize(text) {
  var match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  return match ? match[1] + " " + match[2].toUpperCase() : null;
}

function parseQuality(text) {
  if (!text) return "Unknown";
  if (text.match(/4k|2160p/i)) return "2160p";
  if (text.match(/1080p/i)) return "1080p";
  if (text.match(/720p/i)) return "720p";
  if (text.match(/480p/i)) return "480p";
  return "720p";
}

function getIndexQuality(str) {
  if (!str) return "Unknown";
  var match = str.match(/(\d{3,4})[pP]/);
  if (match) return match[1] + "p";
  if (str.toUpperCase().includes("4K") || str.toUpperCase().includes("UHD")) return "2160p";
  return "Unknown";
}

function cleanTitle(title) {
  var parts = title.split(/[.\-_]/);
  var qualityTags = ["WEBRip", "WEB-DL", "WEB", "BluRay", "HDRip", "DVDRip", "HDTV", "CAM", "TS"];
  var startIndex = parts.findIndex(function(part) {
    return qualityTags.some(function(tag) {
      return part.toLowerCase().includes(tag.toLowerCase());
    });
  });
  if (startIndex !== -1) {
    return parts.slice(startIndex).join(".");
  }
  return parts.slice(-3).join(".");
}

// src/4khdhub/bypass.js
function bypassHrefli(url) {
  return __async(this, null, function* () {
    try {
      console.log("[4KHDHub] Bypassing redirect: " + url);
      var res = yield fetch(url, { headers: { "User-Agent": USER_AGENT } });
      var html = yield res.text();
      var $ = cheerio.load(html);

      var form0 = $("form#landing");
      var form0Action = form0.attr("action") || url;
      var form0Inputs = {};
      form0.find("input").each(function(_, inp) {
        form0Inputs[$(inp).attr("name")] = $(inp).attr("value") || "";
      });

      if (!form0Inputs["_wp_http"]) return url;

      var postRes = yield fetch(form0Action, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(form0Inputs).toString()
      });
      var postHtml = yield postRes.text();
      var $post = cheerio.load(postHtml);

      var form1 = $post("form#landing");
      var form1Action = form1.attr("action");
      var form1Inputs = {};
      form1.find("input").each(function(_, inp) {
        form1Inputs[$post(inp).attr("name")] = $post(inp).attr("value") || "";
      });

      if (!form1Inputs["_wp_http2"]) return url;

      var postRes2 = yield fetch(form1Action, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": form0Action
        },
        body: new URLSearchParams(form1Inputs).toString()
      });
      var postHtml2 = yield postRes2.text();
      var $post2 = cheerio.load(postHtml2);

      var scriptContent = "";
      $post2("script").each(function(_, el) {
        scriptContent += $post2(el).html() + "\n";
      });

      var match = scriptContent.match(/s_343\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/);
      if (match) {
        var cookieName = match[1];
        var cookieValue = match[2];
        var finalUrl = "https://cloud.unblockedgames.world/?go=" + cookieName;

        var finalRes = yield fetch(finalUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Cookie": cookieName + "=" + cookieValue
          }
        });
        var finalHtml = yield finalRes.text();
        var $final = cheerio.load(finalHtml);

        var metaRefresh = $final('meta[http-equiv="refresh"]').attr("content");
        if (metaRefresh) {
          var urlMatch = metaRefresh.match(/url=([^"]+)/i);
          if (urlMatch) {
            return urlMatch[1];
          }
        }
      }
    } catch (err) {
      console.log("[4KHDHub bypass] Failed: " + err.message);
    }
    return url;
  });
}

// src/4khdhub/index.js
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    try {
      var domain = yield getLatestDomain();
      var media = yield getMediaDetails(tmdbId, mediaType);
      if (!media) return [];

      console.log("[4KHDHub] Title: " + media.title + ", Year: " + media.year);

      var searchWord = media.title.replace(/[^\w\s]/gi, "");
      var query = encodeURIComponent(searchWord + " " + media.year);
      var searchUrl = domain + "/?s=" + query;
      console.log("[4KHDHub] Searching: " + searchUrl);

      var res = yield fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } });
      var html = yield res.text();
      var $ = cheerio.load(html);

      var searchResults = [];
      $("article, div.post, div.entry-grid").each(function(_, el) {
        var linkEl = $(el).find("h2.entry-title a, h2.title a, a.post-image-link");
        var href = linkEl.attr("href");
        var title = linkEl.text().trim() || $(el).find("h2.entry-title").text().trim();
        if (href && title) {
          searchResults.push({ title: title, url: href });
        }
      });

      if (searchResults.length === 0) {
        console.log("[4KHDHub] No search results for: " + media.title);
        return [];
      }

      var bestPost = searchResults[0];
      var searchedTitle = media.title.toLowerCase();
      var matchedTitle = bestPost.title.toLowerCase();
      var searchWords = searchedTitle.split(/\s+/).filter(function(w) { return w.length > 2; });
      var isMatched = searchWords.every(function(word) { return matchedTitle.includes(word); });

      if (!isMatched) {
        console.log("[4KHDHub] Title mismatch: " + bestPost.title);
        return [];
      }

      console.log("[4KHDHub] Fetching post: " + bestPost.title);
      var postRes = yield fetch(bestPost.url, { headers: { "User-Agent": USER_AGENT } });
      var postHtml = yield postRes.text();
      var $post = cheerio.load(postHtml);

      var rawStreams = [];
      $post("a").each(function(_, el) {
        var href = $post(el).attr("href") || "";
        var text = $post(el).text().trim() || $post(el).parent().text().trim();

        if (href.match(/hubdrive|gdrive|gdtot|appdrive|gdflix|drive|sharer|kolop|unblockedgames|sid=/i)) {
          var quality = parseQuality(text + " " + bestPost.title);
          var size = parseSize(text);
          rawStreams.push({
            name: "4KHDHub \u2022 " + quality,
            title: cleanTitle(bestPost.title) + (size ? " [" + size + "]" : ""),
            url: href,
            quality: quality,
            size: size || "",
            provider: "4khdhub"
          });
        }
      });

      console.log("[4KHDHub] Found " + rawStreams.length + " raw links");

      // Limit and resolve redirects
      var linksToResolve = rawStreams.slice(0, 15);
      var resolvedStreams = yield Promise.all(linksToResolve.map(function(stream) {
        return __async(this, null, function* () {
          if (stream.url.includes("unblockedgames") || stream.url.includes("sid=")) {
            var resolvedUrl = yield bypassHrefli(stream.url);
            return __spreadProps(__spreadValues({}, stream), { url: resolvedUrl });
          }
          return stream;
        });
      }));

      var finalStreams = resolvedStreams.filter(function(stream) {
        var url = stream.url.toLowerCase();
        return !url.includes("4khdhub") && !url.includes("/4k-movies/") && url.startsWith("http");
      });

      console.log("[4KHDHub] Returning " + finalStreams.length + " streams");
      return finalStreams;
    } catch (error) {
      console.error("[4KHDHub] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams: getStreams };
