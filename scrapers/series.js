const axios = require("axios");
const cheerio = require("cheerio");
const Buffer = require("buffer").Buffer;

const BASE_URL = "https://a.asd.homes";
const SERIES_CATEGORY = "/category/arabic-series-6/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Series list fetching function omitted for brevity (use previous getSeries)

async function fetchAllEpisodesForSeason(seasonId, refererUrl, csrfToken, cookies) {
  // Implementation as before (omitted for brevity)
}

async function getSeriesMeta(id) {
  // Implementation as before (omitted for brevity)
}

// Extraction helpers for hosts

async function extractDoodstream(url) {
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });
    const match = response.data.match(/\$\.get\('(\/pass_md5\/[^']+)'/);
    if (match) {
      const passUrl = url.split('/e/')[0] + match[1];
      const passResponse = await axios.get(passUrl, {
        headers: { "User-Agent": USER_AGENT, Referer: url },
        timeout: 5000,
      });
      if (passResponse.data) {
        return passResponse.data + "zUEJeL3mUN?token=" + url.split('/').pop();
      }
    }
  } catch (error) {
    console.error("[Doodstream]", error.message);
  }
  return null;
}

async function extractStreamwish(url) {
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const patterns = [
      /file:"([^"]+\.m3u8[^"]*)"/,
      /sources:\[\{file:"([^"]+)"/,
      /"file":"([^"]+\.m3u8[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = response.data.match(pattern);
      if (match && match[1]) return match[1];
    }
  } catch (error) {
    console.error("[Streamwish]", error.message);
  }
  return null;
}

async function extractVidguard(url) {
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const patterns = [
      /sources:\[\{file:"([^"]+)"/,
      /"file":"([^"]+\.m3u8[^"]*)"/,
      /file:"([^"]+\.m3u8[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = response.data.match(pattern);
      if (match && match[1]) return match[1];
    }
  } catch (error) {
    console.error("[Vidguard]", error.message);
  }
  return null;
}

async function extractMp4upload(url) {
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const patterns = [
      /player\.src\(\{[^}]*src:\s*["']([^"']+)["']/,
      /"file":"([^"]+\.m3u8[^"]*)"/,
      /\|([0-9]+)\|[0-9]+\|[0-9]+\|src/,
    ];

    for (const pattern of patterns) {
      const match = response.data.match(pattern);
      if (match && match[1] && match[1].includes("http")) {
        return match[1];
      }
    }

    const urlMatch = response.data.match(/https?:\/\/[^\"'\s]+\.(m3u8|mp4)[^\"'\s]*/);
    if (urlMatch) return urlMatch[0];
  } catch (error) {
    console.error("[Mp4upload]", error.message);
  }
  return null;
}

async function extractEarnvids(url) {
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const patterns = [
      /sources:\s*\[\{file:"([^"]+)"/,
      /"file":"([^"]+\.m3u8[^"]*)"/,
      /file:"([^"]+\.m3u8[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = response.data.match(pattern);
      if (match && match[1]) return match[1];
    }
  } catch (error) {
    console.error("[Earnvids]", error.message);
  }
  return null;
}

async function extractKrakenfiles(url) {
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const patterns = [
      /"videoUrl":"([^"]+)"/,
      /videoUrl\s*=\s*["']([^"']+)["']/,
      /https?:\/\/[^\"'\s]+krakenfiles[^\"'\s]+\.mp4[^\"'\s]*/,
    ];

    for (const pattern of patterns) {
      const match = response.data.match(pattern);
      if (match && match[1]) {
        let videoUrl = match[1];
        videoUrl = videoUrl.replace(/\\/g, "");
        return videoUrl;
      }
    }
  } catch (error) {
    console.error("[Krakenfiles]", error.message);
  }
  return null;
}

async function extractLulustream(url) {
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const patterns = [
      /sources:\[\{file:"([^"]+)"/,
      /"file":"([^"]+\.m3u8[^"]*)"/,
      /file:"([^"]+\.m3u8[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = response.data.match(pattern);
      if (match && match[1]) return match[1];
    }
  } catch (error) {
    console.error("[Lulustream]", error.message);
  }
  return null;
}

async function extractFileupload(url) {
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const patterns = [
      /"file":"([^"]+\.m3u8[^"]*)"/,
      /sources:\[\{file:"([^"]+)"/,
      /file:"([^"]+\.m3u8[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = response.data.match(pattern);
      if (match && match[1]) return match[1];
    }
  } catch (error) {
    console.error("[Fileupload]", error.message);
  }
  return null;
}

async function extractVideoUrl(embedUrl, driver) {
  const driverLower = (driver || "").toLowerCase();
  console.log(`[EXTRACTOR] Attempting ${driver}: ${embedUrl.substring(0, 50)}...`);

  let videoUrl = null;

  if (driverLower.includes("mixdrop")) {
    // Implement mixdrop extraction if desired
  } else if (driverLower.includes("dood")) {
    videoUrl = await extractDoodstream(embedUrl);
  } else if (driverLower.includes("streamwish") || driverLower.includes("streamhg")) {
    videoUrl = await extractStreamwish(embedUrl);
  } else if (driverLower.includes("vidguard")) {
    videoUrl = await extractVidguard(embedUrl);
  } else if (driverLower.includes("mp4upload")) {
    videoUrl = await extractMp4upload(embedUrl);
  } else if (driverLower.includes("earnvids") || driverLower.includes("videoland")) {
    videoUrl = await extractEarnvids(embedUrl);
  } else if (driverLower.includes("kraken")) {
    videoUrl = await extractKrakenfiles(embedUrl);
  } else if (driverLower.includes("lulu")) {
    videoUrl = await extractLulustream(embedUrl);
  } else if (driverLower.includes("fileupload") || driverLower.includes("file-upload")) {
    videoUrl = await extractFileupload(embedUrl);
  } else {
    // Generic extraction fallback
    try {
      const response = await axios.get(embedUrl, {
        headers: { "User-Agent": USER_AGENT, Referer: embedUrl },
        timeout: 10000,
      });

      const patterns = [
        /file:"([^"]+\.m3u8[^"]*)"/,
        /sources:\[\{file:"([^"]+)"/,
        /"file":"([^"]+\.m3u8[^"]*)"/,
        /"file":"([^"]+\.mp4[^"]*)"/,
        /https?:\/\/[^\"'\s]+\.(m3u8|mp4)[^\"'\s]*/,
      ];

      for (const pattern of patterns) {
        const match = response.data.match(pattern);
        if (match && match[1]) {
          videoUrl = match[1];
          break;
        }
      }
    } catch (error) {
      console.error(`[Generic ${driver}]`, error.message);
    }
  }

  if (videoUrl) {
    console.log(`[EXTRACTOR] ✓ ${driver}: Success`);
  } else {
    console.log(`[EXTRACTOR] ✗ ${driver}: Failed`);
  }

  return videoUrl;
}

async function getSeriesStreams(id) {
  try {
    const encodedEpisodeUrl = id.split(":")[1];
    if (!encodedEpisodeUrl) {
      console.log(`[DEBUG] No URL found in series stream ID: ${id}`);
      return [];
    }

    const episodeUrl = Buffer.from(encodedEpisodeUrl, "base64").toString();
    console.log(`[DEBUG] Fetching streams from episode URL: ${episodeUrl}`);

    const response = await axios.get(episodeUrl, { headers: { "User-Agent": USER_AGENT }, timeout: 10000 });
    const $ = cheerio.load(response.data);

    const watchBtnHref = $('a.watch__btn').attr("href");
    console.log(`[DEBUG] watch__btn href: ${watchBtnHref}`);

    if (watchBtnHref) {
      const watchUrl = watchBtnHref.startsWith("http") ? watchBtnHref : `${BASE_URL}${watchBtnHref}`;
      console.log(`[DEBUG] Full watch URL: ${watchUrl}`);

      const watchResponse = await axios.get(watchUrl, { headers: { "User-Agent": USER_AGENT }, timeout: 10000 });
      const $watch = cheerio.load(watchResponse.data);

      const liElements = $watch("li[data-link]");
      console.log(`[DEBUG] Found ${liElements.length} li elements with data-link`);

      const streams = [];
      const processedSources = new Set();

      for (let i = 0; i < liElements.length; i++) {
        const el = liElements[i];
        const $el = $watch(el);
        const embedUrl = $el.attr("data-link");
        console.log(`[DEBUG] li[${i}] embedUrl: ${embedUrl}`);

        if (embedUrl && !processedSources.has(embedUrl)) {
          processedSources.add(embedUrl);
          const fullUrl = embedUrl.startsWith("http") ? embedUrl : `https:${embedUrl}`;
          console.log(`[DEBUG] Full embed URL: ${fullUrl}`);

          let driver = "Unknown";
          if (fullUrl.includes("mixdrop")) driver = "mixdrop";
          else if (fullUrl.includes("dood")) driver = "doodstream";
          else if (fullUrl.includes("streamwish")) driver = "streamwish";
          else if (fullUrl.includes("vidguard")) driver = "vidguard";
          else if (fullUrl.includes("vidmoly")) driver = "vidmoly";
          else if (fullUrl.includes("filemoon")) driver = "filemoon";
          else if (fullUrl.includes("mp4upload")) driver = "mp4upload";
          else if (fullUrl.includes("earnvids")) driver = "earnvids";
          else if (fullUrl.includes("kraken")) driver = "krakenfiles";
          else if (fullUrl.includes("lulustream")) driver = "lulustream";
          else if (fullUrl.includes("fileupload")) driver = "fileupload";

          console.log(`[DEBUG] Determined driver: ${driver}`);

          const videoUrl = await extractVideoUrl(fullUrl, driver);
          console.log(`[DEBUG] Video URL extracted: ${videoUrl}`);

          if (videoUrl) {
            streams.push({
              name: `Arabseed - ${driver}`,
              title: driver,
              url: videoUrl,
            });
          } else {
            console.log(`[DEBUG] No video URL extracted for embed URL: ${fullUrl}`);
          }
        }
      }

      console.log(`[DEBUG] Total streams found: ${streams.length}`);
      return streams;
    } else {
      console.log("[DEBUG] No watch__btn button found");
      return [];
    }
  } catch (error) {
    console.error("[STREAM ERROR]", error.message);
    return [];
  }
}

module.exports = {
  getSeries,
  getSeriesMeta,
  getSeriesStreams,
  extractVideoUrl,
};
