const axios = require("axios");
const cheerio = require("cheerio");
const Buffer = require("buffer").Buffer;

const BASE_URL = "https://a.asd.homes";
const SERIES_CATEGORY = "/category/arabic-series-6/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Fetch series catalog
async function getSeries(skip = 0) {
  try {
    const page = skip > 0 ? Math.floor(skip / 20) + 1 : 1;
    const url = page > 1 ? `${BASE_URL}${SERIES_CATEGORY}page/${page}/` : `${BASE_URL}${SERIES_CATEGORY}`;
    console.log(`[DEBUG] Fetching series page: ${url}`);

    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const series = [];

    $(".movie__block").each((i, elem) => {
      const $elem = $(elem);
      const seriesUrl = $elem.attr("href");
      const title = $elem.find(".post__info h3").text().trim();
      const posterUrl = $elem.find(".post__image img").attr("data-src") || $elem.find(".post__image img").attr("src");
      const description = $elem.find(".post__info p").text().trim();

      if (!seriesUrl || !title) return;

      const validPoster = posterUrl && posterUrl.startsWith("http") ? posterUrl : undefined;
      const id = "asd:" + Buffer.from(seriesUrl).toString("base64");

      series.push({
        id,
        type: "series",
        name: title,
        poster: validPoster,
        posterShape: "poster",
        description: description || `[translate:مسلسل] ${title}`,
      });
    });

    console.log(`[DEBUG] Total series parsed: ${series.length}`);
    return series;
  } catch (error) {
    console.error(`[ERROR] Failed to fetch series catalog:`, error);
    return [];
  }
}

async function fetchAllEpisodesForSeason(seasonId, refererUrl, csrfToken, cookies) {
  // Implementation as you provided originally, omitted here for brevity
  // Use your full fetchAllEpisodesForSeason function from your original code.
}

async function getSeriesMeta(id) {
  // Use your original getSeriesMeta implementation here
  // Include all debug logs and handling as per your existing code
}

async function extractVideoUrl(url, driver) {
  // Simplified placeholder
  console.log(`[DEBUG] extractVideoUrl called for driver: ${driver} url: ${url}`);
  // For now return url directly; extend this with actual host logic as needed
  return url;
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

    const watchBtnHref = $("a.watch__btn").attr("href");
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

          // Detect driver simplistically by URL substring
          let driver = "Unknown";
          if (fullUrl.includes("mixdrop")) driver = "mixdrop";
          else if (fullUrl.includes("dood")) driver = "doodstream";
          else if (fullUrl.includes("streamwish")) driver = "streamwish";
          else if (fullUrl.includes("vidguard")) driver = "vidguard";
          else if (fullUrl.includes("vidmoly")) driver = "vidmoly";
          else if (fullUrl.includes("filemoon")) driver = "filemoon";
          else if (fullUrl.includes("mp4upload")) driver = "mp4upload";

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
