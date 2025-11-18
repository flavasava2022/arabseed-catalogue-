const axios = require("axios");
const cheerio = require("cheerio");
const Buffer = require("buffer").Buffer;

const BASE_URL = "https://a.asd.homes";
const MOVIES_CATEGORY = "/category/arabic-movies-6/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function getMovies(skip = 0) {
  try {
    const page = skip > 0 ? Math.floor(skip / 20) + 1 : 1;
    const url =
      page > 1
        ? `${BASE_URL}${MOVIES_CATEGORY}page/${page}/`
        : `${BASE_URL}${MOVIES_CATEGORY}`;
    console.log("Fetching movies from:", url);

    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const movies = [];

    $(".movie__block").each((i, elem) => {
      const $elem = $(elem);
      const movieUrl = $elem.attr("href");
      const title = $elem.find(".post__info h3").text().trim();
      const posterUrl =
        $elem.find(".post__image img").attr("data-src") ||
        $elem.find(".post__image img").attr("src");
      const description = $elem.find(".post__info p").text().trim();
      const yearMatch = title.match(/\((\d{4})\)/);
      const year = yearMatch ? yearMatch[1] : "";

      if (!movieUrl || !title) {
        console.log("Skipping item - missing URL or title");
        return;
      }

      const id = "asd:" + Buffer.from(movieUrl).toString("base64");
      const validPoster =
        posterUrl && posterUrl.startsWith("http") ? posterUrl : undefined;

      movies.push({
        id,
        type: "movie",
        name: title,
        poster: validPoster,
        posterShape: "poster",
        description: description || `فيلم ${title}`,
        releaseInfo: year,
      });
    });

    console.log(`✓ Found ${movies.length} movies`);
    return movies;
  } catch (error) {
    console.error("Error fetching movies:", error.message);
    return [];
  }
}

async function getMovieMeta(id) {
  try {
    const movieUrl = Buffer.from(id.replace("asd:", ""), "base64").toString();
    console.log("Fetching movie meta from:", movieUrl);

    const response = await axios.get(movieUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });
    const $ = cheerio.load(response.data);
    const title =
      $(".post__title h1").text().trim() || $(".post__name").text().trim();
    const posterUrl =
      $(".poster__single img")?.attr("src") ||
      $(".post__image img")?.attr("data-src") ||
      $(".post__image img")?.attr("src");
    const description =
      $(".story__text").text().trim() || $(".post__story").text().trim();
    const year = $(".year").text().trim();



    if (title && posterUrl) {
            console.log("Movie meta fetched:", { title, posterUrl, year });
      return {
        id: id,
        type: "movie",
        name: title,
        background: posterUrl||undefined,
        description: description,
        releaseInfo: year,
      };
    }
  } catch (error) {
    console.error("Error fetching movie meta:", error.message);
    return { meta: {} };
  }
}

async function getMovieStreams(id) {
  try {
    const movieSlug = Buffer.from(id.replace("asd:", ""), "base64").toString();
    const watchUrl = `${movieSlug}watch/`;
    console.log("Fetching movie streams from:", watchUrl);

    const response = await axios.get(watchUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const streams = [];

    $("iframe").each((i, elem) => {
      const src = $(elem).attr("src");
      if (src) {
        streams.push({
          name: "ArabSeed",
          title: `خادم ${i + 1}`,
          url: src,
        });
      }
    });

    console.log(`✓ Found ${streams.length} streams`);
    return streams;
  } catch (error) {
    console.error("Error fetching movie streams:", error.message);
    return [];
  }
}

module.exports = { getMovies, getMovieMeta, getMovieStreams };
