/**
 * OlaMovies Provider - Built from src/olamovies/
 * Generated: 2026-06-05T00:00:00.000Z
 */
"use strict";

var cheerio = require("cheerio-without-node-native");

var BASE_URL = "https://olamovies.dad";
var TMDB_API = "https://api.themoviedb.org/3";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ============ UTILITY FUNCTIONS ============

function getIndexQuality(str) {
  if (!str) return "Unknown";
  var match = str.match(/(\d{3,4})[pP]/);
  if (match) return match[1] + "p";
  if (str.toUpperCase().includes("4K") || str.toUpperCase().includes("UHD")) return "2160p";
  if (str.toUpperCase().includes("HDR")) return "2160p";
  return "1080p";
}

function extractSize(text) {
  var match = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  return match ? match[1] + " " + match[2].toUpperCase() : null;
}

function cleanTitle(title) {
  var parts = title.split(/[.\-_]/);
  var qualityTags = ["WEBRip", "WEB-DL", "WEB", "BluRay", "HDRip", "DVDRip", "HDTV", "CAM", "TS", "R5", "BRRip", "BDRip"];
  var audioTags = ["AAC", "AC3", "DTS", "MP3", "FLAC", "DD5", "EAC3", "Atmos"];
  var codecTags = ["x264", "x265", "H264", "HEVC", "AVC"];

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

// ============ SEARCH FUNCTIONS ============

function searchByTitle(title, year) {
  var query = encodeURIComponent((title + " " + (year || "")).trim());
  var searchUrl = BASE_URL + "/?s=" + query;
  console.log("[OlaMovies] Search URL: " + searchUrl);

  return fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      console.log("[OlaMovies] Response length: " + html.length + " bytes");
      var $ = cheerio.load(html);
      var results = [];

      // Try article/post selectors first
      $("article, div.post, div.entry-post").each(function(_, el) {
        var linkEl = $(el).find("h2.entry-title a, h2.title a, a");
        var href = linkEl.attr("href");
        var postTitle = linkEl.text().trim() || $(el).find("h2").text().trim();

        if (href && postTitle) {
          results.push({ title: postTitle, url: href });
        }
      });

      // Fallback: look for links with movie/show paths
      if (results.length === 0) {
        $("a").each(function(_, el) {
          var href = $(el).attr("href") || "";
          var linkTitle = $(el).text().trim();
          if (href.match(/\/movies\/|\/shows\/|\/m\//i) && linkTitle.toLowerCase().includes(title.toLowerCase())) {
            results.push({ title: linkTitle, url: href });
          }
        });
      }

      console.log("[OlaMovies] Found " + results.length + " search results");
      return results;
    })
    .catch(function(error) {
      console.error("[OlaMovies] Search failed:", error.message);
      return [];
    });
}

// ============ LINK EXTRACTION ============

function extractLinksFromPost(postUrl, postTitle) {
  console.log("[OlaMovies] Fetching post: " + postUrl);

  return fetch(postUrl, { headers: { "User-Agent": USER_AGENT } })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var $ = cheerio.load(html);
      var streams = [];

      $("a").each(function(_, el) {
        var href = $(el).attr("href") || "";
        var text = $(el).text().trim() || $(el).parent().text().trim();
        var parentText = $(el).closest("p, div, td").text().trim();
        var combinedText = text + " " + parentText + " " + postTitle;

        if (href.match(/drive|megaup|mega|gdrive|gdtot|kolop|sharer|hubdrive|appdrive|gdflix/i)) {
          var quality = getIndexQuality(combinedText);
          var size = extractSize(parentText) || extractSize(text);

          streams.push({
            name: "OlaMovies \u2022 " + quality,
            title: cleanTitle(postTitle) + (size ? " [" + size + "]" : ""),
            url: href,
            quality: quality,
            size: size || "",
            provider: "olamovies"
          });
        }
      });

      console.log("[OlaMovies] Found " + streams.length + " download links");
      return streams;
    })
    .catch(function(error) {
      console.error("[OlaMovies] Post fetch error:", error.message);
      return [];
    });
}

// ============ MAIN ENTRY POINT ============

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  var isSeries = mediaType === "series" || mediaType === "tv";
  var endpoint = isSeries ? "tv" : "movie";
  var tmdbUrl = TMDB_API + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  console.log("[OlaMovies] Fetching TMDB: " + tmdbUrl);

  return fetch(tmdbUrl)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var title = isSeries ? data.name : data.title;
      var year = isSeries
        ? (data.first_air_date ? data.first_air_date.split("-")[0] : "")
        : (data.release_date ? data.release_date.split("-")[0] : "");

      console.log("[OlaMovies] Title: " + title + ", Year: " + year);

      if (!title) {
        console.log("[OlaMovies] No title found from TMDB");
        return [];
      }

      return searchByTitle(title, year);
    })
    .then(function(results) {
      if (!results || results.length === 0) {
        console.log("[OlaMovies] No search results");
        return [];
      }

      // Title match verification
      var bestPost = results[0];
      console.log("[OlaMovies] Best match: " + bestPost.title);

      return extractLinksFromPost(bestPost.url, bestPost.title);
    })
    .then(function(streams) {
      // Filter out self-links and invalid URLs
      var filtered = streams.filter(function(stream) {
        var url = stream.url.toLowerCase();
        return url.startsWith("http") && !url.includes("olamovies");
      });

      console.log("[OlaMovies] Returning " + filtered.length + " streams");
      return filtered;
    })
    .catch(function(error) {
      console.error("[OlaMovies] Error: " + error.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };
