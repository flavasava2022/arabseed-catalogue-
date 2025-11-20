const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const manifest = require("./manifest");
const Buffer = require("buffer").Buffer;

const {
  getMovies,
  getMovieMeta,
  getMovieStreams,
} = require("./scrapers/movies");
const {
  getSeries,
  getSeriesMeta,
  getSeriesStreams,
} = require("./scrapers/series");

const builder = new addonBuilder(manifest);
// Shared search function that returns all results
async function searchArabSeed(query, filterType) {
  try {
    console.log(`[DEBUG] Searching for: "${query}", filter: ${filterType}`);

    // Search without type filter to get all results
    const searchUrl = `https://a.asd.homes/find/?word=${encodeURIComponent(
      query
    )}&type=`;
    console.log(`[DEBUG] Search URL: ${searchUrl}`);

    const response = await axios.get(searchUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $(".movie__block").each((i, elem) => {
      const $elem = $(elem);
      const itemUrl = $elem.attr("href");
      const title = $elem.find(".post__info h3").text().trim();
      const posterUrl =
        $elem.find(".post__image img").attr("data-src") ||
        $elem.find(".post__image img").attr("src");
      const description = $elem.find(".post__info p").text().trim();

      if (!itemUrl || !title) return;

      // Determine if it's a movie or series based on URL or title
      const isSeries =
        itemUrl.includes("/series/") ||
        itemUrl.includes("/مسلسل/") ||
        title.includes("مسلسل");

      const isMovie =
        itemUrl.includes("/movie/") ||
        itemUrl.includes("/فيلم/") ||
        title.includes("فيلم") ||
        !isSeries; // Default to movie if not clearly a series

      // Filter based on requested type
      if (filterType === "movie" && !isMovie) return;
      if (filterType === "series" && !isSeries) return;

      const validPoster =
        posterUrl && posterUrl.startsWith("http") ? posterUrl : undefined;
      const id = "asd:" + Buffer.from(itemUrl).toString("base64");

      const yearMatch = title.match(/\((\d{4})\)/);
      const year = yearMatch ? yearMatch[1] : "";

      results.push({
        id,
        type: isSeries ? "series" : "movie",
        name: title,
        poster: validPoster,
        posterShape: "poster",
        description:
          description || (isSeries ? `مسلسل ${title}` : `فيلم ${title}`),
        releaseInfo: year || undefined,
      });
    });

    console.log(
      `[DEBUG] Search found ${results.length} results (filter: ${filterType})`
    );
    return results;
  } catch (error) {
    console.error(`[ERROR] Search failed:`, error.message);
    return [];
  }
}
const catalogHandler = async ({ type, id, extra }) => {
  const skip = extra?.skip ? parseInt(extra.skip) : 0;
  const searchQuery = extra.search || null;
  if (searchQuery) {
    console.log(
      `[CATALOG] Search query detected: "${searchQuery}" for type: ${type}`
    );
    const results = await searchArabSeed(searchQuery, type);
    return { metas: results };
  }
  if (type === "movie" && id === "arabseed-arabic-movies") {
    const metas = await getMovies(skip);
    return { metas };
  }
  if (type === "series" && id === "arabseed-arabic-series") {
    SERIES_CATEGORY = "/category/arabic-series-6/";
    const metas = await getSeries(skip, SERIES_CATEGORY);
    return { metas };
  }
  if (type === "series" && id === "arabseed-turkish-series") {
    SERIES_CATEGORY = "/category/turkish-series-2/";
    const metas = await getSeries(skip, SERIES_CATEGORY);
    return { metas };
  }
  return { metas: [] };
};

const metaHandler = async ({ type, id }) => {
  if (type === "movie") return { meta: await getMovieMeta(id) };
  if (type === "series") return { meta: await getSeriesMeta(id) };
  return { meta: null };
};

const streamHandler = async ({ type, id }) => {
  if (type === "movie") return { streams: await getMovieStreams(id) };
  if (type === "series") return { streams: await getSeriesStreams(id) };
  return { streams: [] };
};

builder.defineCatalogHandler(catalogHandler);
builder.defineMetaHandler(metaHandler);
builder.defineStreamHandler(streamHandler);

module.exports = {
  manifest,
  catalogHandler,
  metaHandler,
  streamHandler,
};
