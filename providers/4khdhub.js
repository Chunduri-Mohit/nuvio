/*
 * 4KHDHub Provider for Nuvio
 * ========================================
 * Based on Xyr0nX's proven working implementation
 * Adapted by Mohit with personal TMDB key
 *
 * Features:
 * - Pure .then() chains (no async/await) — direct Hermes compatibility
 * - Multi-layer link collection (download-item → alt selectors → full scan)
 * - Resolvers: hubcloud, hubcdn, hubdrive, 10gbps, buzzserver
 * - FSL domain support: lotuscdn, yummy.monster, odyssey.surf, maverick.lat, etc.
 * - Host confidence scoring & priority sorting
 * - Smart deduplication
 * - Rich emoji-formatted stream metadata
 * - Levenshtein fuzzy title matching
 */
var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "4khdhub";
var DOMAINS_URL = "https://raw.githubusercontent.com/Xyr0nX/NGEX/refs/heads/main/manifest.json";
var DEFAULT_MAIN_URL = "https://4khdhub.dad";
var TMDB_API_KEY = "66a4be2c09e7a3191882b870f449b58a";
var DEBUG = false;

var FALLBACK_DOMAINS = [
  "https://4khdhub.dad",
  "https://4khdhub.link",
  "https://4khdhub.click",
  "https://4khdhub.sbs",
  "https://4khdhub.cfd"
];

var KNOWN_URLS = {};

var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1"
};

var cachedDomains = null;
var domainCacheTs = 0;
var DOMAIN_CACHE_TTL = 60 * 60 * 1000;

var cachedActiveMainUrl = null;
var activeMainUrlTs = 0;
var ACTIVE_URL_CACHE_TTL = 30 * 60 * 1000;

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
    .replace(/4kHDHub\.Com/gi, "")
    .replace(/4kHdHub\.com/gi, "")
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

function buildStream(label, finalUrl, finalQuality, streamHeaders, size, tech, langHint, meta) {
  var ui = buildMeta(meta, label, finalQuality, size, tech, langHint);
  return {
    name: ui.name,
    title: ui.title,
    url: finalUrl,
    quality: finalQuality,
    headers: Object.keys(streamHeaders || {}).length ? streamHeaders : undefined,
    behaviorHints: { bingeGroup: "4khdhub-" + String(finalQuality || "auto").toLowerCase() }
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
    name: "4KHDHub | " + quality + (size ? " | " + size : ""),
    title: line1 + "\n" + line2 + "\n" + line3
  };
}

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
  if (/^https?:\/\/(?:www\.)?hdhub4u\./i.test(u)) return false;
  if (/tinyurl\.com\/unblock-ban-site/i.test(u)) return false;
  if (/hubcloud\.[^\/]+\/tg\/go\?/i.test(u)) return false;
  if (/hubcloud\.[^\/]+\/drive\/[^\/?#]+$/i.test(u)) return false;
  if (u.indexOf("goldmines") !== -1 && u.indexOf(".workers.dev") !== -1) return true;
  if (u.indexOf("pub-") !== -1 && u.indexOf(".r2.dev/") !== -1) return true;
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
  if (u.indexOf("video-downloads.googleusercontent.com/") !== -1) return 10;
  return 10;
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

// --- Domain Resolution ---

function getDomains() {
  var now = Date.now();
  if (cachedDomains && now - domainCacheTs < DOMAIN_CACHE_TTL) {
    return Promise.resolve(cachedDomains);
  }
  return fetchJson(DOMAINS_URL).then(function(json) {
    cachedDomains = json || {};
    domainCacheTs = now;
    return cachedDomains;
  }).catch(function() {
    cachedDomains = cachedDomains || {};
    domainCacheTs = now;
    return cachedDomains;
  });
}

function probeActiveDomain() {
  return Promise.all(FALLBACK_DOMAINS.map(function(domain) {
    return fetch(domain + "/", {
      method: "HEAD", redirect: "follow", headers: DEFAULT_HEADERS
    }).then(function(res) {
      var ok = res.ok || res.status === 200 || res.status === 301 || res.status === 302;
      return { domain: domain, ok: ok };
    }).catch(function() {
      return { domain: domain, ok: false };
    });
  })).then(function(results) {
    for (var i = 0; i < results.length; i++) {
      if (results[i].ok) return results[i].domain;
    }
    return DEFAULT_MAIN_URL;
  });
}

function getMainUrl() {
  var now = Date.now();
  if (cachedActiveMainUrl && now - activeMainUrlTs < ACTIVE_URL_CACHE_TTL) {
    return Promise.resolve(cachedActiveMainUrl);
  }
  return getDomains().then(function(domains) {
    var fromManifest = domains["4khdhub"] || domains.n4khdhub || "";
    if (fromManifest) {
      return fetch(fromManifest + "/", {
        method: "HEAD", redirect: "follow", headers: DEFAULT_HEADERS
      }).then(function(res) {
        if (res.ok || res.status === 200) {
          cachedActiveMainUrl = fromManifest;
          activeMainUrlTs = now;
          return fromManifest;
        }
        return probeActiveDomain().then(function(d) {
          cachedActiveMainUrl = d; activeMainUrlTs = now; return d;
        });
      }).catch(function() {
        return probeActiveDomain().then(function(d) {
          cachedActiveMainUrl = d; activeMainUrlTs = now; return d;
        });
      });
    }
    return probeActiveDomain().then(function(d) {
      cachedActiveMainUrl = d; activeMainUrlTs = now; return d;
    });
  }).catch(function() {
    return probeActiveDomain().then(function(d) {
      cachedActiveMainUrl = d; activeMainUrlTs = now; return d;
    });
  });
}

// --- TMDB ---

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
      year: (data.release_date || data.first_air_date || "").split("-")[0],
      duration: data.runtime ? data.runtime + "m" : ""
    };
  }).catch(function() {
    return { title: "", original: "", year: "", duration: "" };
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

// --- Search ---

function searchContent(query, mediaType, year) {
  return getMainUrl().then(function(mainUrl) {
    var cleanQuery = query.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    var searchQuery = cleanQuery + (year ? " " + year : "");
    var searchUrl = mainUrl + "/?s=" + encodeURIComponent(searchQuery);
    console.log("[4KHDHub] Searching:", searchUrl);
    return fetchText(searchUrl).then(function(html) {
      var $ = cheerio.load(html);
      var results = [];
      var CARD_SELECTOR = [
        "div.card-grid a.movie-card", "a.movie-card", "div.card-grid a[href]",
        "div.result-item a", "article.post a.lnk-blk", "div.TPost a",
        "div.TPostMv a", "ul.MovieList li a"
      ].join(", ");

      $(CARD_SELECTOR).each(function(_, el) {
        var href = fixUrl($(el).attr("href"), mainUrl);
        if (!href) return;
        if (/\/(category|tag|author|page|feed|wp-admin|wp-login|about|contact|dmca|privacy)/i.test(href)) return;
        if (href === mainUrl + "/" || href === mainUrl) return;
        try { if (new URL(href).hostname !== new URL(mainUrl).hostname) return; } catch(e) {}

        var title = $(el).find(".movie-card-title, h2, h3, h4, .entry-title, .title").first().text().trim() ||
          $(el).attr("title") || $(el).attr("aria-label") ||
          $(el).find("img").attr("alt") || $(el).text().trim();
        if (!title || title.length < 2) return;

        var combinedText = (title + " " + href).toLowerCase();
        var isSeriesCard = /\bseries\b/i.test(title) || /-series-?\d*/i.test(href) ||
          /\/series\//i.test(href) || /\bseason\s*\d+\b/i.test(combinedText);
        if (mediaType === "movie" && isSeriesCard) return;
        if (mediaType !== "movie" && !isSeriesCard) return;

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
        var yearDistance = year && itemYear ? Math.abs(itemYear - year) : 0;
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
      console.log("[4KHDHub] Best match:", results[0].title, "->", results[0].href);
      return results[0].href || null;
    });
  });
}

// --- Link Collection ---

function collectMovieLinks($, pageUrl) {
  var links = [];
  $("div.download-item, div[data-file-id]").each(function(_, el) {
    var root = $(el);
    var href = fixUrl(root.find("a[href]").first().attr("href"), pageUrl);
    var label = cleanLabelText(root.text().trim() || "Movie");
    var fileTitle = cleanLabelText(root.find(".file-title").first().text().trim() || "");
    if (!href) return;
    links.push({ url: href, label: label, fileTitle: fileTitle, rawHtml: root.html() || "" });
  });

  if (!links.length) {
    var ALT = [
      "div.download-links a[href]", "div.gdlink a[href]", "div.dllinks a[href]",
      "div.movie-download a[href]", "div.movie-card-content a[href]",
      "div.entry-content p a[href]", "div.thecontent p a[href]",
      "table.table a[href]", "div.box-content a[href]",
      "div.wp-block-buttons a[href]", "p > a[href]"
    ].join(", ");
    $(ALT).each(function(_, el) {
      var href = fixUrl($(el).attr("href"), pageUrl);
      if (!href) return;
      var lower = href.toLowerCase();
      var isHoster = lower.indexOf("hubcloud") !== -1 || lower.indexOf("hubdrive") !== -1 ||
        lower.indexOf("hubcdn") !== -1 || lower.indexOf("workers.dev") !== -1 ||
        lower.indexOf("r2.dev") !== -1 || /\.(mp4|mkv|m3u8)(\?|$)/i.test(lower);
      if (!isHoster) return;
      var label = cleanLabelText($(el).closest("p, div, li, tr, td").first().text().trim() || $(el).text().trim() || "Movie");
      links.push({ url: href, label: label, fileTitle: cleanLabelText($(el).text().trim() || ""), rawHtml: $(el).parent().html() || "" });
    });
  }

  if (!links.length) {
    $("a[href]").each(function(_, el) {
      var href = fixUrl($(el).attr("href"), pageUrl);
      if (!href) return;
      var lower = href.toLowerCase();
      var isHoster = lower.indexOf("hubcloud") !== -1 || lower.indexOf("hubdrive") !== -1 ||
        lower.indexOf("hubcdn") !== -1 || lower.indexOf("workers.dev") !== -1 ||
        lower.indexOf("r2.dev") !== -1 || /\.(mp4|mkv|m3u8)(\?|$)/i.test(lower);
      if (!isHoster) return;
      var label = cleanLabelText($(el).closest("p, div, li").first().text().trim() || $(el).text().trim() || "Movie");
      links.push({ url: href, label: label, fileTitle: cleanLabelText($(el).text().trim() || ""), rawHtml: $(el).parent().html() || "" });
    });
  }

  return uniqueBy(links, function(item) { return String(item.url || "").toLowerCase(); });
}

function collectEpisodeLinks($, pageUrl, season, episode) {
  var sNum = Number(season);
  var eNum = Number(episode);
  var label = "S" + sNum + " E" + eNum;
  var found = [];

  $("div.episodes-list div.season-item").each(function(_, seasonEl) {
    var seasonText = $(seasonEl).find("div.episode-number").first().text();
    var seasonMatch = seasonText.match(/S(?:eason)?\s*([0-9]+)/i);
    if (!seasonMatch || Number(seasonMatch[1]) !== sNum) return;
    $(seasonEl).find("div.episode-download-item").each(function(__, episodeEl) {
      var epText = $(episodeEl).text();
      var epMatch = epText.match(/Episode-?\s*0*([0-9]+)/i) || epText.match(/\bE\s*0*([0-9]+)/i);
      if (!epMatch || Number(epMatch[1]) !== eNum) return;
      $(episodeEl).find("a[href]").each(function(___, a) {
        var href = fixUrl($(a).attr("href"), pageUrl);
        if (!href) return;
        found.push({ url: href, label: label, fileTitle: cleanLabelText($(episodeEl).find(".file-title, .episode-file-title").first().text().trim() || ""), rawHtml: $(episodeEl).html() || "" });
      });
    });
  });

  if (!found.length) {
    $("div.episode-download-item").each(function(_, item) {
      var text = $(item).text();
      if (!new RegExp("Episode-?\\s*0*" + eNum + "\\b", "i").test(text) &&
          !new RegExp("\\bE\\s*0*" + eNum + "\\b", "i").test(text)) return;
      $(item).find("a[href]").each(function(__, a) {
        var href = fixUrl($(a).attr("href"), pageUrl);
        if (!href) return;
        found.push({ url: href, label: label, fileTitle: cleanLabelText($(item).find(".file-title, .episode-file-title").first().text().trim() || ""), rawHtml: $(item).html() || "" });
      });
    });
  }

  return uniqueBy(found, function(item) { return String(item.url || "").toLowerCase(); });
}

// --- Link Resolvers ---

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

function resolveLink(rawUrl, label, referer, quality, langHint, meta) {
  if (!rawUrl) return Promise.resolve([]);
  var lower = String(rawUrl).toLowerCase();
  if (lower.indexOf("hubcloud") !== -1) return resolveHubcloud(rawUrl, label, referer, quality, langHint, meta);
  if (lower.indexOf("hubcdn") !== -1) return resolveHubcdn(rawUrl, label, quality, "", "", langHint, meta);
  if (isTrustedDirectCandidate(rawUrl)) {
    return Promise.resolve([buildStream(label, rawUrl, quality, { Referer: referer }, "", "", langHint, meta)]);
  }
  return Promise.resolve([]);
}

// --- Page Extraction ---

function extractFromPage(contentUrl, mediaType, season, episode, meta) {
  return fetchText(contentUrl).then(function(html) {
    var $ = cheerio.load(html);
    var hasEpisodeList = $("div.episodes-list, div.episodelist, ul.episodios, div.season-item").length > 0;
    var isMoviePage = !hasEpisodeList;
    var links = (mediaType === "movie" || isMoviePage)
      ? collectMovieLinks($, contentUrl)
      : collectEpisodeLinks($, contentUrl, season, episode);
    if (!links.length) return [];
    links = sortLinksByPriority(links);
    return Promise.all(links.map(function(item) {
      var quality = detectQualityFromSources([item.fileTitle || "", item.label || "", item.rawHtml || ""]);
      var label = cleanLabelText(item.fileTitle || item.label || PROVIDER_NAME);
      var langHint = [item.fileTitle || "", item.label || "", item.rawHtml || ""].join(" ");
      return resolveLink(item.url, label, contentUrl, quality, langHint, meta).catch(function() { return []; });
    })).then(function(groups) {
      var streams = [];
      for (var i = 0; i < groups.length; i += 1) streams = streams.concat(groups[i] || []);
      streams = dedupeStreams(streams);
      streams.sort(function(a, b) { return hostConfidence(b.url) - hostConfidence(a.url); });
      return streams;
    });
  });
}

function findContentUrl(tmdbId, mediaType) {
  return getTmdbNames(tmdbId, mediaType).then(function(names) {
    if (!names.title && !names.original) return null;
    var key = names.title + " " + names.year;
    if (KNOWN_URLS[key]) return KNOWN_URLS[key];
    return searchContent(names.title, mediaType, names.year).then(function(found) {
      if (found) return found;
      if (names.original && names.original !== names.title) {
        return searchContent(names.original, mediaType, names.year);
      }
      return null;
    });
  });
}

// --- Main Entry Point ---

function getStreams(tmdbId, mediaType, season, episode) {
  return getTmdbNames(tmdbId, mediaType).then(function(tmdbData) {
    var epPromise = (mediaType === "tv")
      ? getTmdbEpisodeName(tmdbId, season, episode)
      : Promise.resolve("");
    return epPromise.then(function(epTitle) {
      return findContentUrl(tmdbId, mediaType).then(function(contentUrl) {
        if (!contentUrl) return [];
        var meta = {
          title: tmdbData.title || "Movie",
          year: tmdbData.year || "",
          season: season,
          episode: episode,
          episodeTitle: epTitle
        };
        return extractFromPage(contentUrl, mediaType, season, episode, meta);
      });
    });
  }).catch(function() { return []; });
}

module.exports = { getStreams: getStreams };
