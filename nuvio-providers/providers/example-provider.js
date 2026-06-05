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

// src/example-provider/index.js
var cheerio = require("cheerio-without-node-native");
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    console.log(`[Example Provider] Received request for ID: ${tmdbId}, Type: ${mediaType}`);
    try {
      const streams = [];
      if (mediaType === "movie") {
        streams.push({
          name: "Demo Server (MP4) - 1080p",
          title: "Big Buck Bunny (Direct)",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          quality: "1080p",
          provider: "example-provider"
        });
        streams.push({
          name: "Demo Server (M3U8) - 720p",
          title: "Sintel HLS Stream",
          url: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
          quality: "720p",
          provider: "example-provider"
        });
      } else if (mediaType === "tv") {
        streams.push({
          name: "Demo TV Server - 1080p",
          title: `S${seasonNum}E${episodeNum} - Tears of Steel`,
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
          quality: "1080p",
          provider: "example-provider"
        });
      }
      return streams;
    } catch (error) {
      console.error("[Example Provider] Error fetching streams:", error);
      return [];
    }
  });
}
module.exports = { getStreams };
