/*
 * UHDMovies Provider for Nuvio
 * ========================================
 * Author: Mohit
 * Pattern: Xyr0nX-style (pure .then() chains, no async/await)
 *
 * Features:
 * - Auto-domain resolution via DuckDuckGo HTML scraping + known-domain probing
 * - Pure .then() chains — direct Hermes engine compatibility
 * - Multi-layer link collection with proper resolvers
 * - Resolvers: hubcloud, hubcdn, unblockedgames bypass, direct links
 * - Host confidence scoring & priority sorting
 * - Smart deduplication
 * - Rich emoji-formatted stream metadata
 * - Levenshtein fuzzy title matching
 */
var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "uhdmovies";
var TMDB_API_KEY = "66a4be2c09e7a3191882b870f449b58a";
var DEBUG = false;

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

var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1"
};

var domainCache = { url: null, ts: 0 };
var CACHE_TTL = 60 * 60 * 1000;

function dbg() {
  if (!DEBUG) return;
  console.log.apply(console, arguments);
}

function assign(target, source) {
  var out = {};
  var k;
  target = target || {};
  source = source || {};
  for (k in target) out[k] = target[k];
  for (k in source) out[k] = source[k];
  return out;
}

function fetchWithTimeout(url, options) {
  options = options || {};
  var timeoutMs = options.timeout || 15000;
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var signal = controller ? controller.signal : undefined;
  
  var timeoutId = setTimeout(function() {
    if (controller) controller.abort();
  }, timeoutMs);

  var fetchOpts = assign({ signal: signal }, options);
  delete fetchOpts.timeout;

  return fetch(url, fetchOpts).then(function(res) {
    clearTimeout(timeoutId);
    return res;
  }).catch(function(err) {
    clearTimeout(timeoutId);
    throw err;
  });
}

function fetchText(url, options) {
  return fetchWithTimeout(url, options).then(function(res) {
    if (!res.ok && res.status !== 301 && res.status !== 302) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }
    return res.text();
  });
}

function fetchJson(url, options) {
  return fetchWithTimeout(url, options).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " -> " + url);
    return res.json();
  });
}

function fetchResponse(url, options) {
  return fetchWithTimeout(url, options);
}


function fixUrl(url, baseUrl) {
  if (!url) return "";
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
  if (url.indexOf("//") === 0) return "https:" + url;
  try { return new URL(url, baseUrl).toString(); } catch(e) { return url; }
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractMainTitle(title) {
  var t = String(title || "");
  t = t.replace(/\[Season\s*[^\]]+\]/gi, "");
  t = t.replace(/\bS[0-9]+(-S[0-9]+)?\b/gi, "");
  t = t.replace(/\bSeason\s*[0-9]+(-[0-9]+)?\b/gi, "");
  var yearMatch = t.match(/\b(19|20)[0-9]{2}\b/);
  if (yearMatch) {
    t = t.split(yearMatch[0])[0];
  }
  var resMatch = t.match(/\b(2160p|1440p|1080p|720p|480p|4k|uhd)\b/i);
  if (resMatch) {
    t = t.split(resMatch[0])[0];
  }
  return t.replace(/[\[\]()\-:|]/g, " ").replace(/\s+/g, " ").trim();
}


function levenshteinDistance(s, t) {
  if (s === t) return 0;
  var n = s.length, m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  var d = [];
  var i, j, cost;
  for (i = 0; i <= n; i += 1) { d[i] = []; d[i][0] = i; }
  for (j = 0; j <= m; j += 1) d[0][j] = j;
  for (i = 1; i <= n; i += 1) {
    for (j = 1; j <= m; j += 1) {
      cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost);
    }
  }
  return d[n][m];
}

function detectQualityFromSources(parts) {
  var sources = Array.isArray(parts) ? parts : [parts];
  var i, text, m;
  for (i = 0; i < sources.length; i += 1) {
    text = String(sources[i] || "").toLowerCase();
    m = text.match(/\b(2160p|1440p|1080p|720p|480p)\b/);
    if (m) return m[1];
    if (/\b4k\b|\buhd\b/.test(text) && !/\b1080p\b/.test(text)) return "2160p";
  }
  return "Auto";
}

function inferLang(text) {
  var t = String(text || "").toLowerCase();
  var langs = [];
  if (t.indexOf("hindi") !== -1) langs.push("Hindi");
  if (t.indexOf("tamil") !== -1) langs.push("Tamil");
  if (t.indexOf("telugu") !== -1) langs.push("Telugu");
  if (t.indexOf("malayalam") !== -1) langs.push("Malayalam");
  if (t.indexOf("kannada") !== -1) langs.push("Kannada");
  if (t.indexOf("bengali") !== -1) langs.push("Bengali");
  if (t.indexOf("punjabi") !== -1) langs.push("Punjabi");
  if (t.indexOf("english") !== -1 || /\beng\b/.test(t)) langs.push("English");
  langs = uniqueBy(langs, function(x) { return x; });
  if (langs.length > 2) return "Multi Audio";
  if (langs.length === 2) return langs.join("-");
  if (langs.length === 1) return langs[0];
  if (t.indexOf("dual audio") !== -1 || t.indexOf("dual") !== -1) return "Dual Audio";
  return "EN";
}

function cleanTech(title) {
  var normalized = String(title || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/WEB[-_. ]?DL/gi, "WEB-DL")
    .replace(/WEB[-_. ]?RIP/gi, "WEBRIP")
    .replace(/H[ .]?265/gi, "H265")
    .replace(/H[ .]?264/gi, "H264")
    .replace(/DDP[ .]?([0-9]\.[0-9])/gi, "DDP$1")
    .replace(/DTS[-_. ]?HD[-_. ]?MA/gi, "DTSHDMA")
    .replace(/DOLBY[-_. ]?VISION/gi, "DOLBYVISION");
  var allowed = {
    "WEB-DL":1,"WEBRIP":1,"BLURAY":1,"HDRIP":1,"DVDRIP":1,"HDTV":1,
    "CAM":1,"TS":1,"BRRIP":1,"BDRIP":1,"REMUX":1,
    "H264":1,"H265":1,"X264":1,"X265":1,"HEVC":1,"AVC":1,
    "AAC":1,"AC3":1,"DTS":1,"DTSHDMA":1,"TRUEHD":1,"ATMOS":1,
    "DD":1,"HDR":1,"HDR10":1,"HDR10+":1,"DV":1,"DOLBYVISION":1,
    "NF":1,"CR":1,"SDR":1
  };
  var parts = normalized.split(/[ ._()\[\]+-]+/);
  var out = [];
  var seen = {};
  var i, part;
  for (i = 0; i < parts.length; i += 1) {
    part = String(parts[i] || "").toUpperCase();
    if (!part) continue;
    if (allowed[part] || /^DDP\d\.\d$/.test(part)) {
      if (!seen[part]) { seen[part] = 1; out.push(part); }
    }
  }
  return out.join(" ");
}

function cleanLabelText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/Download HubDrive/gi, "")
    .replace(/Download HubCloud/gi, "")
    .replace(/Download PixelDrain/gi, "")
    .replace(/Download BuzzServer/gi, "")
    .replace(/UHDMovies\.Com/gi, "")
    .replace(/uhdmovies\.[\w]+/gi, "")
    .trim();
}

function extractSize(text) {
  var m = String(text || "").match(/\b(\d+(?:\.\d+)?)\s*(GB|MB)\b/i);
  return m ? (m[1] + " " + m[2].toUpperCase()) : "";
}

function uniqueBy(list, keyFn) {
  var seen = {};
  var out = [];
  var i, key;
  for (i = 0; i < list.length; i += 1) {
    key = keyFn(list[i]);
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(list[i]);
  }
  return out;
}

function dedupeStreams(streams) {
  return uniqueBy(streams, function(s) {
    var titleKey = String(s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    var qualRaw = String(s.quality || "").toLowerCase();
    if (!qualRaw) {
      var qm = titleKey.match(/(2160p|1080p|720p|480p)/);
      qualRaw = qm ? qm[1] : "auto";
    }
    var qualKey = qualRaw.replace(/[^a-z0-9]/g, "");
    var urlKey = String(s.url || "").slice(0, 60).replace(/[^a-z0-9]/g, "");
    return titleKey + "|" + qualKey + "|" + urlKey;
  });
}

// --- Stream Building ---

function buildStream(label, finalUrl, finalQuality, streamHeaders, size, tech, langHint, meta) {
  var ui = buildMeta(meta, label, finalQuality, size, tech, langHint);
  return {
    name: ui.name,
    title: ui.title,
    url: finalUrl,
    quality: finalQuality,
    headers: Object.keys(streamHeaders || {}).length ? streamHeaders : undefined,
    behaviorHints: { bingeGroup: "uhdmovies-" + String(finalQuality || "auto").toLowerCase() }
  };
}

function buildMeta(meta, label, quality, size, tech, langHint) {
  var cleanedLabel = cleanLabelText(label);
  var lang = inferLang((langHint || "") + " " + cleanedLabel);
  var isSeries = !!(meta && (meta.season || meta.episode));
  var displayTitle = (meta && meta.title) ? meta.title : (isSeries ? "Series" : "Movie");
  var year = (meta && meta.year) ? " - " + meta.year : "";
  var line1;
  if (isSeries) {
    var epTitlePart = meta.episodeTitle ? " - " + meta.episodeTitle : "";
    line1 = "📺 S" + meta.season + "E" + meta.episode + epTitlePart + " | " + displayTitle + year;
  } else {
    line1 = "🎬 " + displayTitle + year;
  }
  var qIcon = (quality.indexOf('2160') !== -1 || quality.indexOf('4K') !== -1) ? '💎' : '📺';
  var line2 = qIcon + " " + quality + " | 🌍 " + lang + (size ? " | 💾 " + size : "");
  var extMatch = cleanedLabel.match(/\.(mkv|mp4|m4v|avi|mov)$/i);
  var extension = extMatch ? extMatch[1].toUpperCase() : "MKV";
  var line3 = "🎞️ " + extension + " | ℹ️ " + (tech || "WEB-DL");
  return {
    name: "UHDMovies | " + quality + (size ? " | " + size : ""),
    title: line1 + "\n" + line2 + "\n" + line3
  };
}

// --- Playable URL Detection ---

function isPlayableMediaUrl(url) {
  var u = String(url || "").toLowerCase();
  if (!u) return false;
  if (/\.(mkv|mp4|m3u8)(\?|#|$)/.test(u)) return true;
  if (u.indexOf("video-downloads.googleusercontent.com/") !== -1) return true;
  if (u.indexOf(".r2.dev/") !== -1) return true;
  if (u.indexOf(".workers.dev/") !== -1) return true;
  if (u.indexOf("hub.lotuscdn.club/") !== -1) return true;
  if (u.indexOf("hub.yummy.monster/") !== -1) return true;
  if (u.indexOf("hub.odyssey.surf/") !== -1) return true;
  if (u.indexOf("hub.maverick.lat/") !== -1) return true;
  if (u.indexOf("cdn.fukggl.buzz/") !== -1) return true;
  if (u.indexOf("hub.diskcdn.buzz/") !== -1) return true;
  if (/\/drive\/admin(?:[/?#]|$)/.test(u)) return false;
  if (/^https?:\/\/(?:www\.)?google\.com\/search\?/i.test(u)) return false;
  if (/^https?:\/\/t\.me\//i.test(u)) return false;
  if (/^https?:\/\/one\.one\.one\.one\/?$/i.test(u)) return false;
  if (/tinyurl\.com\/unblock-ban-site/i.test(u)) return false;
  if (/hubcloud\.[^\/]+\/tg\/go\?/i.test(u)) return false;
  return false;
}

function hostConfidence(url) {
  var u = String(url || "").toLowerCase();
  if (u.indexOf("hub.lotuscdn.club") !== -1) return 95;
  if (u.indexOf("hub.yummy.monster") !== -1) return 95;
  if (u.indexOf("hub.odyssey.surf") !== -1) return 95;
  if (u.indexOf("hub.maverick.lat") !== -1) return 94;
  if (u.indexOf("cdn.fukggl.buzz") !== -1) return 93;
  if (u.indexOf("hub.diskcdn.buzz") !== -1) return 93;
  if (u.indexOf("hubcdn") !== -1) return 80;
  if (u.indexOf("hblinks") !== -1) return 60;
  if (u.indexOf("hubcloud") !== -1) return 50;
  if (u.indexOf("hubdrive") !== -1) return 30;
  if (u.indexOf(".workers.dev") !== -1) return 25;
  if (u.indexOf(".r2.dev") !== -1) return 22;
  if (u.indexOf("unblockedgames") !== -1) return 20;
  if (u.indexOf("video-downloads.googleusercontent.com/") !== -1) return 10;
  if (u.indexOf("drive.google") !== -1) return 10;
  return 5;
}

function sortLinksByPriority(links) {
  return (links || []).slice().sort(function(a, b) {
    return hostConfidence(b.url) - hostConfidence(a.url);
  });
}

function isTrustedDirectCandidate(link) {
  var u = String(link || "").toLowerCase();
  if (!u) return false;
  if (u.indexOf("video-downloads.googleusercontent.com/") !== -1) return true;
  if (u.indexOf(".r2.dev/") !== -1) return true;
  if (u.indexOf(".workers.dev/") !== -1) {
    if (u.indexOf("pixel.") !== -1) return false;
    if (u.indexOf("gpdl.") !== -1) return false;
    return true;
  }
  if (u.indexOf("hub.lotuscdn.club/") !== -1) return true;
  if (u.indexOf("hub.yummy.monster/") !== -1) return true;
  if (u.indexOf("hub.odyssey.surf/") !== -1) return true;
  if (u.indexOf("hub.maverick.lat/") !== -1) return true;
  if (u.indexOf("cdn.fukggl.buzz/") !== -1) return true;
  if (u.indexOf("hub.diskcdn.buzz/") !== -1) return true;
  if (/\.(mkv|mp4|m3u8)(\?|#|$)/.test(u)) return true;
  return false;
}

// ─── Domain Resolution (DuckDuckGo + Probing) ──────────────────────────────

function resolveDomain() {
  var now = Date.now();
  if (domainCache.url && now - domainCache.ts < CACHE_TTL) {
    return Promise.resolve(domainCache.url);
  }

  // Step 1: Try DuckDuckGo HTML search
  var ddgUrl = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent("uhdmovies 4k dual audio");
  console.log("[UHDMovies] Resolving domain via DuckDuckGo...");

  return fetchText(ddgUrl, { headers: { Accept: "text/html" } })
    .then(function(ddgHtml) {
      var domainRegex = /https?:\/\/uhdmovies\.[a-z.]{2,10}/gi;
      var matches = ddgHtml.match(domainRegex);
      if (matches && matches.length > 0) {
        var unique = [];
        var seen = {};
        for (var i = 0; i < matches.length; i++) {
          var m = matches[i].toLowerCase().replace(/\/$/, "");
          if (!seen[m]) { seen[m] = 1; unique.push(m); }
        }
        // Probe resolved matches to see if any are alive
        return Promise.all(unique.slice(0, 3).map(function(candidate) {
          return fetch(candidate + "/", {
            method: "HEAD", redirect: "follow", headers: DEFAULT_HEADERS
          }).then(function(res) {
            var ok = res.ok || res.status === 200 || res.status === 301 || res.status === 302;
            return { domain: candidate, ok: ok };
          }).catch(function() {
            return { domain: candidate, ok: false };
          });
        })).then(function(results) {
          for (var i = 0; i < results.length; i++) {
            if (results[i].ok) {
              console.log("[UHDMovies] DuckDuckGo resolved active domain:", results[i].domain);
              domainCache = { url: results[i].domain, ts: now };
              return results[i].domain;
            }
          }
          return null;
        });
      }
      return null;
    })
    .catch(function(err) {
      console.log("[UHDMovies] DuckDuckGo resolution failed:", err.message);
      return null;
    })
    .then(function(resolved) {
      if (resolved) return resolved;

      // Step 2: Probe known domains
      console.log("[UHDMovies] Falling back to known-domain probing...");
      return probeKnownDomains();
    });
}

function probeKnownDomains() {
  var now = Date.now();
  return Promise.all(KNOWN_DOMAINS.map(function(candidate) {
    return fetch(candidate, {
      method: "HEAD", redirect: "follow", headers: DEFAULT_HEADERS
    }).then(function(res) {
      var ok = res.ok || res.status === 200 || res.status === 301 || res.status === 302;
      return { domain: candidate, ok: ok };
    }).catch(function() {
      return { domain: candidate, ok: false };
    });
  })).then(function(results) {
    for (var i = 0; i < results.length; i++) {
      if (results[i].ok) {
        console.log("[UHDMovies] Probe hit:", results[i].domain);
        domainCache = { url: results[i].domain, ts: now };
        return results[i].domain;
      }
    }
    console.log("[UHDMovies] All probes failed. Using fallback:", KNOWN_DOMAINS[0]);
    domainCache = { url: KNOWN_DOMAINS[0], ts: now };
    return KNOWN_DOMAINS[0];
  });
}

// ─── TMDB ───────────────────────────────────────────────────────────────────

function getTmdbNames(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";
  var url = "https://api.tmdb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return fetch(url).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function(data) {
    return {
      title: data.name || data.title || "",
      original: data.original_name || data.original_title || data.name || data.title || "",
      year: (data.release_date || data.first_air_date || "").split("-")[0]
    };
  }).catch(function() {
    return { title: "", original: "", year: "" };
  });
}

function getTmdbEpisodeName(tmdbId, season, episode) {
  if (!season || !episode) return Promise.resolve("");
  var url = "https://api.tmdb.org/3/tv/" + tmdbId + "/season/" + season + "/episode/" + episode + "?api_key=" + TMDB_API_KEY;
  return fetch(url).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function(data) {
    return data.name || "";
  }).catch(function() { return ""; });
}

// ─── Search ─────────────────────────────────────────────────────────────────

function searchContent(query, mediaType, year, mainUrl) {
  var cleanQuery = query.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  var searchQuery = cleanQuery + (year ? " " + year : "");
  var searchUrl = mainUrl + "/?s=" + encodeURIComponent(searchQuery);
  console.log("[UHDMovies] Searching:", searchUrl);

  return fetchText(searchUrl).then(function(html) {
    var $ = cheerio.load(html);
    var results = [];

    // UHDMovies uses gridlove-post articles and entry-title links
    var CARD_SELECTOR = [
      "article.gridlove-post", "article", "div.post",
      "div.result-item", "div.TPost", "div.TPostMv"
    ].join(", ");

    $(CARD_SELECTOR).each(function(_, el) {
      var $el = $(el);
      var href = fixUrl(
        $el.find("h1.sanket a, h2.entry-title a, h2.title a, a.post-image-link, div.entry-image > a").first().attr("href") ||
        $el.find("a[href]").first().attr("href"),
        mainUrl
      );
      if (!href) return;
      if (/\/(category|tag|author|page|feed|wp-admin|wp-login|about|contact|dmca|privacy)/i.test(href)) return;
      if (href === mainUrl + "/" || href === mainUrl) return;

      var title = $el.find("h1.sanket, h2.entry-title a, h2.title a, .entry-title, .title").first().text().trim() ||
        $el.find("a").attr("title") || $el.find("img").attr("alt") || "";
      if (!title || title.length < 2) return;

      var combinedText = (title + " " + href).toLowerCase();
      var cleanedTitle = String(title).replace(/[.*?[\]()]/g, "").replace(/\s+details$/i, "").trim();

      var normQuery = normalizeTitle(query);
      var normTitle = normalizeTitle(cleanedTitle);

      // Strict filter: query must match words in title
      if (normTitle.indexOf(normQuery) === -1) {
        var queryWords = normQuery.split(" ");
        var matchedWords = 0;
        for (var w = 0; w < queryWords.length; w++) {
          if (normTitle.indexOf(queryWords[w]) !== -1) {
            matchedWords++;
          }
        }
        if (matchedWords < Math.ceil(queryWords.length / 2)) {
          return;
        }
      }

      var mainTitle = extractMainTitle(cleanedTitle);
      var yearMatch = combinedText.match(/\b(19|20)\d{2}\b/);
      var itemYear = yearMatch ? parseInt(yearMatch[0], 10) : 0;
      var distance = levenshteinDistance(normalizeTitle(mainTitle), normalizeTitle(query));
      var yearDistance = year && itemYear ? Math.abs(itemYear - parseInt(year, 10)) : 0;
      var exactBoost = normalizeTitle(mainTitle) === normalizeTitle(query) ? -100 : 0;
      var includesBoost = normalizeTitle(mainTitle).indexOf(normalizeTitle(query)) !== -1 ? -10 : 0;

      results.push({
        href: href, title: cleanedTitle, year: itemYear,
        distance: distance, yearDistance: yearDistance,
        score: distance + yearDistance + exactBoost + includesBoost
      });

    });

    if (!results.length) return null;
    results.sort(function(a, b) {
      return a.score - b.score || a.distance - b.distance || a.yearDistance - b.yearDistance;
    });
    console.log("[UHDMovies] Best match:", results[0].title, "->", results[0].href);
    return results[0].href || null;
  });
}

// ─── Link Collection ────────────────────────────────────────────────────────

function isLikelyDownloadLink(href, text) {
  var t = String(text || "").toLowerCase();
  var h = String(href || "").toLowerCase();
  
  if (h.indexOf("hubcloud") !== -1 || h.indexOf("hubcdn") !== -1 || h.indexOf("hubdrive") !== -1 || h.indexOf("lotuscdn") !== -1 || h.indexOf("yummy.monster") !== -1 || h.indexOf("odyssey.surf") !== -1 || h.indexOf("maverick.lat") !== -1 || h.indexOf("fukggl.buzz") !== -1 || h.indexOf("diskcdn.buzz") !== -1) {
    return true;
  }
  
  if (h.indexOf("unblockedgames") !== -1 || h.indexOf("sid=") !== -1) {
    // Check if the link text has download-related words
    var hasDownloadKeyword = /\b(download|drive|g-drive|gdrive|instant|server|workers|r2|direct|click|link|filepress|buzz|page|gdtot|kolop|sharer|appdrive|gdflix)\b/i.test(t);
    if (!hasDownloadKeyword) {
      var sidMatch = h.match(/[?&]sid=([^&]+)/);
      if (sidMatch && sidMatch[1].length < 150) {
        return false;
      }
    }
  }
  
  return true;
}

function collectLinks($, pageUrl) {
  var links = [];
  var linkPattern = /hubcloud|hubdrive|hubcdn|instant|drive|gdrive|sharer|kolop|appdrive|gdflix|vcloud|mdisk|unblockedgames|sid=|driveseed|filepress|workers\.dev|r2\.dev|lotuscdn|yummy\.monster|odyssey\.surf|maverick\.lat|fukggl\.buzz|diskcdn\.buzz/i;
  var gdrivePattern = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?)/i;

  // Layer 1: download-item blocks
  $("div.download-item, div[data-file-id]").each(function(_, el) {
    var root = $(el);
    var href = fixUrl(root.find("a[href]").first().attr("href"), pageUrl);
    if (!href) return;
    if (!isLikelyDownloadLink(href, root.text())) return;
    var label = cleanLabelText(root.text().trim() || "Movie");
    var fileTitle = cleanLabelText(root.find(".file-title").first().text().trim() || "");
    links.push({ url: href, label: label, fileTitle: fileTitle, rawHtml: root.html() || "" });
  });

  // Layer 2: specific download selectors
  if (!links.length) {
    var ALT = [
      "div.download-links a[href]", "div.gdlink a[href]", "div.dllinks a[href]",
      "div.entry-content p a[href]", "div.thecontent p a[href]",
      "div.wp-block-buttons a[href]", "p > a[href]"
    ].join(", ");

    $(ALT).each(function(_, el) {
      var href = fixUrl($(el).attr("href"), pageUrl);
      if (!href || !href.match(/^https?:\/\//)) return;
      if (!linkPattern.test(href) && !gdrivePattern.test(href)) return;
      if (!isLikelyDownloadLink(href, $(el).text())) return;
      var label = cleanLabelText($(el).closest("p, div, li, tr, td").first().text().trim() || $(el).text().trim() || "Movie");
      links.push({ url: href, label: label, fileTitle: cleanLabelText($(el).text().trim() || ""), rawHtml: $(el).parent().html() || "" });
    });
  }

  // Layer 3: full anchor scan
  if (!links.length) {
    $("a[href]").each(function(_, el) {
      var href = fixUrl($(el).attr("href"), pageUrl);
      if (!href || !href.match(/^https?:\/\//)) return;
      if (!linkPattern.test(href) && !gdrivePattern.test(href)) return;
      if (!isLikelyDownloadLink(href, $(el).text())) return;
      var label = cleanLabelText($(el).closest("p, div, li").first().text().trim() || $(el).text().trim() || "Movie");
      links.push({ url: href, label: label, fileTitle: cleanLabelText($(el).text().trim() || ""), rawHtml: $(el).parent().html() || "" });
    });
  }

  console.log("[UHDMovies] Collected", links.length, "raw links");
  return uniqueBy(links, function(item) { return String(item.url || "").toLowerCase(); });
}

// ─── Link Resolvers ─────────────────────────────────────────────────────────

function resolve10Gbps(url, label, quality, size, tech, langHint, meta) {
  function step(current, depth) {
    if (depth >= 6) return Promise.resolve([]);
    return fetchResponse(current, { redirect: "manual", headers: { Referer: current } }).then(function(res) {
      var finalUrl = res.url || current;
      var contentType = String(res.headers.get("content-type") || "").toLowerCase();
      var location = res.headers.get("location") || "";
      if (location) return step(fixUrl(location, current), depth + 1);
      if (isPlayableMediaUrl(finalUrl) || contentType.indexOf("video/") !== -1) {
        return [buildStream(label + " 10Gbps", finalUrl, quality, { Referer: current }, size, tech, langHint, meta)];
      }
      return [];
    }).catch(function() { return []; });
  }
  return step(url, 0);
}

function resolveHubcloud(url, label, referer, quality, langHint, meta) {
  var baseHeaders = referer ? { Referer: referer } : {};
  return fetchText(url, { headers: baseHeaders }).then(function(html) {
    var $ = cheerio.load(html);
    var raw = $("#download").attr("href") || $("a[href*='hubcloud']").attr("href") || $("iframe[src*='hubcloud']").attr("src");
    var entryUrl = fixUrl(raw, url);
    if (!entryUrl) return [];
    return fetchText(entryUrl, { headers: { Referer: url } }).then(function(eHtml) {
      var e$ = cheerio.load(eHtml);
      var size = e$("#size").text().trim() || "";
      var header = e$(".card-header").text().trim() || "";
      var tech = cleanTech(header);
      var finalQuality = detectQualityFromSources([header, quality]);
      var asyncTasks = [];
      var directStreams = [];
      e$("a.btn").each(function(_, el) {
        var link = fixUrl(e$(el).attr("href"), entryUrl);
        var text = e$(el).text().toLowerCase();
        if (!link) return;
        if (text.indexOf("buzzserver") !== -1) {
          asyncTasks.push(
            fetchResponse(link + "/download", { headers: { Referer: link }, redirect: "manual" })
            .then(function(res) {
              var redir = res.headers.get("location");
              return redir ? [buildStream(label + " Buzz", redir, finalQuality, { Referer: link }, size, tech, langHint, meta)] : [];
            }).catch(function() { return []; })
          );
        } else if (text.indexOf("10gbps") !== -1 || (link.indexOf && link.indexOf("gpdl.hubcloud") !== -1)) {
          asyncTasks.push(resolve10Gbps(link, label, finalQuality, size, tech, langHint, meta));
        } else if (isTrustedDirectCandidate(link)) {
          directStreams.push(buildStream(label, link, finalQuality, { Referer: entryUrl }, size, tech, langHint, meta));
        }
      });
      return Promise.all(asyncTasks).then(function(results) {
        var all = directStreams.slice();
        for (var i = 0; i < results.length; i++) all = all.concat(results[i] || []);
        return all;
      });
    });
  }).catch(function() { return []; });
}

function resolveHubcdn(url, label, quality, size, tech, langHint, meta) {
  return fetchText(url, { headers: { Referer: url } }).then(function(html) {
    var encoded = "";
    var match1 = html.match(/r=([A-Za-z0-9+/=]+)/);
    var match2 = html.match(/reurl\s*=\s*"([^"]+)"/);
    if (match1 && match1[1]) encoded = match1[1];
    else if (match2 && match2[1]) encoded = match2[1].split("?r=").pop();
    if (!encoded) return [];
    try {
      var decoded = atob(encoded);
      if (!decoded) return [];
      var finalUrl = decoded.split("link=").pop();
      if (!finalUrl || finalUrl === encoded) return [];
      return [buildStream(label + " HUBCDN", finalUrl, quality, { Referer: url }, size, tech, langHint, meta)];
    } catch(e) { return []; }
  }).catch(function() { return []; });
}

function bypassUnblockedGames(sidUrl, label, quality, langHint, meta, mainDomain) {
  return fetchText(sidUrl).then(function(html) {
    var $ = cheerio.load(html);
    var form0 = $("form#landing");
    var form0Action = form0.attr("action") || sidUrl;
    var form0Inputs = {};
    form0.find("input").each(function(_, inp) {
      form0Inputs[$(inp).attr("name")] = $(inp).attr("value") || "";
    });
    if (!form0Inputs["_wp_http"]) return [];

    return fetchText(form0Action, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form0Inputs).toString()
    }).then(function(postHtml) {
      var $post = cheerio.load(postHtml);
      var form1 = $post("form#landing");
      var form1Action = form1.attr("action");
      var form1Inputs = {};
      form1.find("input").each(function(_, inp) {
        form1Inputs[$post(inp).attr("name")] = $post(inp).attr("value") || "";
      });
      if (!form1Inputs["_wp_http2"]) return [];

      return fetchText(form1Action, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": form0Action },
        body: new URLSearchParams(form1Inputs).toString()
      }).then(function(postHtml2) {
        var $post2 = cheerio.load(postHtml2);
        var scriptContent = "";
        $post2("script").each(function(_, el) {
          scriptContent += $post2(el).html() + "\n";
        });
        var cookieMatch = scriptContent.match(/s_343\s*\(\s*'([^']+)'\s*,\s*'([^']+)'/);
        if (cookieMatch) {
          var cookieName = cookieMatch[1];
          var cookieValue = cookieMatch[2];
          var finalUrl = "https://cloud.unblockedgames.world/?go=" + cookieName;
          return fetchText(finalUrl, {
            headers: { "Cookie": cookieName + "=" + cookieValue }
          }).then(function(finalHtml) {
            var $final = cheerio.load(finalHtml);
            var metaRefresh = $final('meta[http-equiv="refresh"]').attr("content");
            if (metaRefresh) {
              var urlMatch = metaRefresh.match(/url=([^"]+)/i);
              if (urlMatch) {
                var resolvedUrl = urlMatch[1];
                if (isPlayableMediaUrl(resolvedUrl) || isTrustedDirectCandidate(resolvedUrl)) {
                  return [buildStream(label, resolvedUrl, quality, { Referer: mainDomain + "/" }, "", "", langHint, meta)];
                }
                // If it's a hubcloud/hubcdn link, resolve further
                return resolveLink(resolvedUrl, label, mainDomain, quality, langHint, meta);
              }
            }
            return [];
          });
        }

        // Look for direct links in the final page
        var directLinks = [];
        $post2("a[href]").each(function(_, el) {
          var href = $post2(el).attr("href") || "";
          if (isTrustedDirectCandidate(href)) {
            directLinks.push(buildStream(label, href, quality, { Referer: sidUrl }, "", "", langHint, meta));
          }
        });
        return directLinks;
      });
    });
  }).catch(function(err) {
    console.log("[UHDMovies] Bypass failed for " + sidUrl + ": " + err.message);
    return [];
  });
}

function getBaseUrl(url) {
  try {
    var urlObj = new URL(url);
    return urlObj.protocol + "//" + urlObj.host;
  } catch (e) {
    return "";
  }
}

function getIndexQuality(str) {
  if (!str) return "Unknown";
  var match = str.match(/(\d{3,4})[pP]/);
  if (match) return match[1] + "p";
  if (str.toUpperCase().indexOf("4K") !== -1 || str.toUpperCase().indexOf("UHD") !== -1) return "2160p";
  return "Unknown";
}

function extractVideoSeed(finallink, label, quality, meta) {
  try {
    var urlObj = new URL(finallink);
    var host = urlObj.host || "video-seed.xyz";
    var token = finallink.split("?url=")[1];
    if (!token) return Promise.resolve([]);
    
    return fetchText("https://" + host + "/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-token": host,
        "Referer": finallink
      },
      body: "keys=" + encodeURIComponent(token)
    }).then(function(text) {
      var urlMatch = text.match(/url":"([^"]+)"/);
      if (urlMatch) {
        var directUrl = urlMatch[1].replace(/\\\//g, "/");
        return [buildStream(label + " VideoSeed", directUrl, quality, {}, "", "VideoSeed", "", meta)];
      }
      return [];
    }).catch(function() { return []; });
  } catch (e) {
    return Promise.resolve([]);
  }
}

function extractDriveseedPage(url, label, quality, meta) {
  var baseDomain = "";
  
  function getPage(pageUrl) {
    baseDomain = getBaseUrl(pageUrl);
    return fetchText(pageUrl).then(function(html) {
      var $ = cheerio.load(html);
      var qualityText = $("li.list-group-item").first().text() || "";
      var size = $("li:nth-child(3)").text().replace("Size : ", "").trim();
      var parsedQuality = getIndexQuality(qualityText) || quality;
      
      var elements = [];
      $("div.text-center > a").each(function(_, el) {
        elements.push({ text: $(el).text().toLowerCase(), href: $(el).attr("href") });
      });
      
      var tasks = [];
      elements.forEach(function(item) {
        if (!item.href) return;
        if (item.text.indexOf("instant download") !== -1) {
          tasks.push(
            fetchResponse(item.href, { redirect: "follow" }).then(function(res) {
              if (res.url && res.url.indexOf("url=") !== -1) {
                var directUrl = res.url.split("url=")[1];
                return [buildStream(label + " Driveseed Instant", directUrl, parsedQuality, {}, size, "Driveseed", "", meta)];
              }
              return [];
            }).catch(function() { return []; })
          );
        } else if (item.text.indexOf("resume cloud") !== -1) {
          tasks.push(
            fetchText(baseDomain + item.href).then(function(cloudHtml) {
              var cloud$ = cheerio.load(cloudHtml);
              var link = cloud$("a.btn-success").first().attr("href");
              if (link) {
                return [buildStream(label + " Driveseed Cloud", link, parsedQuality, {}, size, "Driveseed", "", meta)];
              }
              return [];
            }).catch(function() { return []; })
          );
        } else if (item.text.indexOf("cloud download") !== -1) {
          var cloudStream = buildStream(label + " Driveseed Cloud", item.href, parsedQuality, {}, size, "Driveseed", "", meta);
          tasks.push(Promise.resolve([cloudStream]));
        }
      });
      
      return Promise.all(tasks).then(function(results) {
        var all = [];
        for (var i = 0; i < results.length; i++) {
          all = all.concat(results[i] || []);
        }
        return all;
      });
    });
  }
  
  if (url.indexOf("r?key=") !== -1) {
    return fetchText(url).then(function(html) {
      var redirectMatch = html.match(/replace\("([^"]+)"\)/);
      var pageUrl = url;
      if (redirectMatch) {
        pageUrl = getBaseUrl(url) + redirectMatch[1];
      }
      return getPage(pageUrl);
    }).catch(function() { return []; });
  } else {
    return getPage(url).catch(function() { return []; });
  }
}

function resolveLink(rawUrl, label, referer, quality, langHint, meta) {
  if (!rawUrl) return Promise.resolve([]);
  var lower = String(rawUrl).toLowerCase();
  
  if (lower.indexOf("driveseed") !== -1 || lower.indexOf("driveleech") !== -1) {
    return extractDriveseedPage(rawUrl, label, quality, meta);
  }
  if (lower.indexOf("video-seed") !== -1) {
    return extractVideoSeed(rawUrl, label, quality, meta);
  }
  if (lower.indexOf("hubcloud") !== -1) return resolveHubcloud(rawUrl, label, referer, quality, langHint, meta);
  if (lower.indexOf("hubcdn") !== -1) return resolveHubcdn(rawUrl, label, quality, "", "", langHint, meta);
  if (lower.indexOf("unblockedgames") !== -1 || lower.indexOf("sid=") !== -1) {
    return bypassUnblockedGames(rawUrl, label, quality, langHint, meta, referer);
  }
  if (isTrustedDirectCandidate(rawUrl)) {
    return Promise.resolve([buildStream(label, rawUrl, quality, { Referer: referer }, "", "", langHint, meta)]);
  }
  // For Google Drive links, return as-is (Nuvio handles them)
  if (lower.indexOf("drive.google") !== -1 || lower.indexOf("googleusercontent") !== -1) {
    return Promise.resolve([buildStream(label, rawUrl, quality, { Referer: referer }, "", "", langHint, meta)]);
  }
  return Promise.resolve([]);
}

// ─── Page Extraction ────────────────────────────────────────────────────────

function extractFromPage(contentUrl, mediaType, season, episode, meta, mainDomain) {
  return fetchText(contentUrl).then(function(html) {
    var $ = cheerio.load(html);
    var links = collectLinks($, contentUrl);
    if (!links.length) return [];
    links = sortLinksByPriority(links);

    // Limit to 5 links to avoid rate-limiting and timeout
    var toResolve = links.slice(0, 5);

    return Promise.all(toResolve.map(function(item) {
      var quality = detectQualityFromSources([item.fileTitle || "", item.label || "", item.rawHtml || ""]);
      var label = cleanLabelText(item.fileTitle || item.label || PROVIDER_NAME);
      var langHint = [item.fileTitle || "", item.label || "", item.rawHtml || ""].join(" ");
      return resolveLink(item.url, label, mainDomain || contentUrl, quality, langHint, meta).catch(function(e) {
        dbg("[UHDMovies] resolveLink FAILED:", item.url, "|", e.message);
        return [];
      });
    })).then(function(groups) {
      var streams = [];
      for (var i = 0; i < groups.length; i += 1) streams = streams.concat(groups[i] || []);
      streams = dedupeStreams(streams);
      streams.sort(function(a, b) { return hostConfidence(b.url) - hostConfidence(a.url); });

      // Filter out links that point back to the site itself
      streams = streams.filter(function(s) {
        var url = s.url.toLowerCase();
        if (url.indexOf("uhdmovies") !== -1) return false;
        if (url.indexOf("/4k-movies/") !== -1) return false;
        if (url.indexOf("/category/") !== -1) return false;
        return true;
      });

      console.log("[UHDMovies] Returning", streams.length, "stream links");
      return streams;
    });
  });
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  return getTmdbNames(tmdbId, mediaType).then(function(tmdbData) {
    if (!tmdbData.title) {
      console.log("[UHDMovies] Could not resolve title from TMDB");
      return [];
    }

    var epPromise = (mediaType === "tv")
      ? getTmdbEpisodeName(tmdbId, season, episode)
      : Promise.resolve("");

    return epPromise.then(function(epTitle) {
      return resolveDomain().then(function(mainDomain) {
        console.log("[UHDMovies] Using domain:", mainDomain);
        console.log("[UHDMovies] Looking for:", tmdbData.title, "(" + tmdbData.year + ")");

        return searchContent(tmdbData.title, mediaType, tmdbData.year, mainDomain).then(function(contentUrl) {
          if (!contentUrl && tmdbData.original && tmdbData.original !== tmdbData.title) {
            return searchContent(tmdbData.original, mediaType, tmdbData.year, mainDomain);
          }
          return contentUrl;
        }).then(function(contentUrl) {
          if (!contentUrl) {
            console.log("[UHDMovies] No matching content found");
            return [];
          }
          console.log("[UHDMovies] Found content page:", contentUrl);
          var meta = {
            title: tmdbData.title || "Movie",
            year: tmdbData.year || "",
            season: season,
            episode: episode,
            episodeTitle: epTitle
          };
          return extractFromPage(contentUrl, mediaType, season, episode, meta, mainDomain);
        });
      });
    });
  }).catch(function(err) {
    console.error("[UHDMovies] Fatal error:", err.message);
    return [];
  });
}

module.exports = { getStreams: getStreams };
