const { addonBuilder } = require("stremio-addon-sdk");
const manifest = require("./manifest");
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

const catalogHandler = async ({ type, id, extra }) => {
  const skip = extra?.skip ? parseInt(extra.skip) : 0;

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
