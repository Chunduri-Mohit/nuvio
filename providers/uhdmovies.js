/**
 * UHDMovies Provider - Built from src/uhdmovies/
 * Generated: 2026-06-05T00:00:00.000Z
 */
"use strict";

var cheerio = require("cheerio-without-node-native");

var DOMAIN = "https://uhdmovies.rodeo";
var DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
var DOMAIN_CACHE = { url: DOMAIN, ts: 0 };

function getLatestDomain() {
  var now = Date.now();
  if (now - DOMAIN_CACHE.ts < 36e5) return Promise.resolve(DOMAIN_CACHE.url);
  return fetch(DOMAINS_URL)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data && data["UHDMovies"]) {
        DOMAIN_CACHE.url = data["UHDMovies"];
        DOMAIN_CACHE.ts = now;
      }
      return DOMAIN_CACHE.url;
    })
    .catch(function() { return DOMAIN_CACHE.url; });
}

var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ============ UTILITY FUNCTIONS ============

function getBaseUrl(url) {
  try {
    var urlObj = new URL(url);
    return urlObj.protocol + "//" + urlObj.host;
  } catch (e) {
    return DOMAIN;
  }
}

function fixUrl(url, domain) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return domain + url;
  return domain + "/" + url;
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
  var qualityTags = ["WEBRip", "WEB-DL", "WEB", "BluRay", "HDRip", "DVDRip", "HDTV", "CAM", "TS", "R5", "DVDScr", "BRRip", "BDRip", "DVD", "PDTV", "HD"];
  var audioTags = ["AAC", "AC3", "DTS", "MP3", "FLAC", "DD5", "EAC3", "Atmos"];
  var subTags = ["ESub", "ESubs", "Subs", "MultiSub", "NoSub", "EnglishSub", "HindiSub"];
  var codecTags = ["x264", "x265", "H264", "HEVC", "AVC"];

  var startIndex = parts.findIndex(function(part) {
    return qualityTags.some(function(tag) {
      return part.toLowerCase().includes(tag.toLowerCase());
    });
  });

  var endIndex = -1;
  for (var i = parts.length - 1; i >= 0; i--) {
    var part = parts[i];
    if (subTags.some(function(tag) { return part.toLowerCase().includes(tag.toLowerCase()); }) ||
      audioTags.some(function(tag) { return part.toLowerCase().includes(tag.toLowerCase()); }) ||
      codecTags.some(function(tag) { return part.toLowerCase().includes(tag.toLowerCase()); })) {
      endIndex = i;
      break;
    }
  }

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    return parts.slice(startIndex, endIndex + 1).join(".");
  } else if (startIndex !== -1) {
    return parts.slice(startIndex).join(".");
  }
  return parts.slice(-3).join(".");
}

function extractSize(text) {
  var match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  return match ? match[1] + " " + match[2].toUpperCase() : null;
}

// ============ SEARCH FUNCTIONS ============

function searchByTitle(title, year) {
  return getLatestDomain().then(function(domain) {
    var query = encodeURIComponent((title + " " + (year || "")).trim());
    var searchUrl = domain + "/?s=" + query;
    console.log("[UHDMovies] Search URL: " + searchUrl);

    return fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT }
    })
      .then(function(response) { return response.text(); })
      .then(function(html) {
        console.log("[UHDMovies] Response length: " + html.length + " bytes");
        return parseSearchResults(html);
      })
      .catch(function(error) {
        console.error("[UHDMovies] Search failed:", error.message);
        return [];
      });
  });
}

function parseSearchResults(html) {
  var $ = cheerio.load(html);
  var results = [];

  $("article.gridlove-post").each(function(_, el) {
    var $el = $(el);
    var titleRaw = $el.find("h1.sanket").text().trim().replace(/^Download\s+/i, "");
    var titleMatch = titleRaw.match(/^(.*\)\d*)/);
    var title = titleMatch ? titleMatch[1] : titleRaw;
    var href = $el.find("div.entry-image > a").attr("href");

    if (href && title) {
      results.push({
        title: title,
        url: href,
        rawTitle: titleRaw
      });
    }
  });

  console.log("[UHDMovies] Found " + results.length + " search results");
  return results;
}

// ============ BYPASS FUNCTIONS ============

function bypassHrefli(url) {
  var host = getBaseUrl(url);
  console.log("[UHDMovies] Bypassing Hrefli: " + url);

  return fetch(url, { headers: { "User-Agent": USER_AGENT } })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var $ = cheerio.load(html);
      var formUrl = $("form#landing").attr("action");
      var formData = {};
      $("form#landing input").each(function(_, el) {
        formData[$(el).attr("name")] = $(el).attr("value") || "";
      });

      return fetch(formUrl, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(formData).toString()
      });
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var $ = cheerio.load(html);
      var formUrl = $("form#landing").attr("action");
      var formData = {};
      $("form#landing input").each(function(_, el) {
        formData[$(el).attr("name")] = $(el).attr("value") || "";
      });

      return fetch(formUrl, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(formData).toString()
      });
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var $ = cheerio.load(html);
      var scriptContent = "";
      $("script").each(function(_, el) {
        scriptContent += $(el).html() + "\n";
      });

      var match = scriptContent.match(/s_343\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/);
      if (match) {
        var cookieName = match[1];
        var cookieValue = match[2];
        var finalUrl = "https://cloud.unblockedgames.world/?go=" + cookieName;

        return fetch(finalUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Cookie": cookieName + "=" + cookieValue
          }
        })
          .then(function(res) { return res.text(); })
          .then(function(finalHtml) {
            var $final = cheerio.load(finalHtml);
            var metaRefresh = $final('meta[http-equiv="refresh"]').attr("content");
            if (metaRefresh) {
              var urlMatch = metaRefresh.match(/url=([^"]+)/i);
              if (urlMatch) return urlMatch[1];
            }
            return url;
          });
      }
      return url;
    })
    .catch(function(err) {
      console.log("[UHDMovies] Bypass failed: " + err.message);
      return url;
    });
}

// ============ LINK EXTRACTION ============

function extractLinksFromPost(postUrl, postTitle) {
  console.log("[UHDMovies] Fetching post: " + postUrl);

  return fetch(postUrl, { headers: { "User-Agent": USER_AGENT } })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var $ = cheerio.load(html);
      var streams = [];

      // Find all download buttons and links
      $("a").each(function(_, el) {
        var href = $(el).attr("href") || "";
        var text = $(el).text().trim() || $(el).parent().text().trim();
        var parentText = $(el).closest("p, div, td").text().trim();
        var combinedText = text + " " + parentText + " " + postTitle;

        if (href.match(/instant|drive|gdrive|sharer|kolop|hubdrive|appdrive|gdflix|vcloud|mdisk|unblockedgames|sid=/i)) {
          var quality = getIndexQuality(combinedText);
          var size = extractSize(parentText) || extractSize(text);

          streams.push({
            name: "UHDMovies \u2022 " + quality,
            title: cleanTitle(postTitle) + (size ? " [" + size + "]" : ""),
            url: href,
            quality: quality,
            size: size || "",
            provider: "uhdmovies"
          });
        }
      });

      console.log("[UHDMovies] Found " + streams.length + " download links");
      return streams;
    })
    .catch(function(error) {
      console.error("[UHDMovies] Post fetch error:", error.message);
      return [];
    });
}

// ============ MAIN ENTRY POINT ============

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  var isSeries = mediaType === "series" || mediaType === "tv";
  var endpoint = isSeries ? "tv" : "movie";
  var tmdbUrl = TMDB_API + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  console.log("[UHDMovies] Fetching TMDB: " + tmdbUrl);

  return fetch(tmdbUrl)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var title = isSeries ? data.name : data.title;
      var year = isSeries
        ? (data.first_air_date ? data.first_air_date.split("-")[0] : "")
        : (data.release_date ? data.release_date.split("-")[0] : "");

      console.log("[UHDMovies] Title: " + title + ", Year: " + year);

      if (!title) {
        console.log("[UHDMovies] No title found from TMDB");
        return [];
      }

      return searchByTitle(title, year);
    })
    .then(function(results) {
      if (!results || results.length === 0) {
        console.log("[UHDMovies] No search results");
        return [];
      }

      var bestPost = results[0];
      console.log("[UHDMovies] Best match: " + bestPost.title);

      return extractLinksFromPost(bestPost.url, bestPost.rawTitle || bestPost.title);
    })
    .then(function(streams) {
      // Resolve redirect links
      var toResolve = streams.slice(0, 15);
      var resolvePromises = toResolve.map(function(stream) {
        if (stream.url.includes("unblockedgames") || stream.url.includes("sid=")) {
          return bypassHrefli(stream.url).then(function(resolvedUrl) {
            stream.url = resolvedUrl;
            return stream;
          });
        }
        return Promise.resolve(stream);
      });

      return Promise.all(resolvePromises);
    })
    .then(function(streams) {
      // Filter out self-links and invalid URLs
      var filtered = streams.filter(function(stream) {
        var url = stream.url.toLowerCase();
        return !url.includes("uhdmovies") && !url.includes("/4k-movies/") && url.startsWith("http");
      });

      console.log("[UHDMovies] Returning " + filtered.length + " streams");
      return filtered;
    })
    .catch(function(error) {
      console.error("[UHDMovies] Error: " + error.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };
