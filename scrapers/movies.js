const axios = require("axios");
const cheerio = require("cheerio");
const Buffer = require("buffer").Buffer;
const { extractVideoUrl } = require("../extractors");

const BASE_URL = "https://a.asd.homes";
const MOVIES_CATEGORY = "/category/arabic-movies-6/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Fetch movies list
async function getMovies(skip = 0) {
  try {
    const page = skip > 0 ? Math.floor(skip / 20) + 1 : 1;
    const url =
      page > 1
        ? `${BASE_URL}${MOVIES_CATEGORY}page/${page}/`
        : `${BASE_URL}${MOVIES_CATEGORY}`;
    console.log(`[DEBUG] Fetching movies page: ${url}`);

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
        console.log("[DEBUG] Skipping item - missing URL or title");
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

    console.log(`[DEBUG] Total movies parsed: ${movies.length}`);
    return movies;
  } catch (error) {
    console.error("[ERROR] Failed to fetch movies:", error.message);
    return [];
  }
}

// Get movie metadata
async function getMovieMeta(id) {
  try {
    const movieUrl = Buffer.from(id.replace("asd:", ""), "base64").toString();
    console.log(`[DEBUG] Fetching movie meta from: ${movieUrl}`);

    const response = await axios.get(movieUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    const title =
      $(".post__title h1").text().trim() || $(".post__name").text().trim();
    const posterUrl =
      $(".poster__single img").attr("src") ||
      $(".poster__single img").attr("data-src");
    const description =
      $(".story__text").text().trim() || $(".post__story").text().trim();
    const year = $(".year").text().trim();

    console.log(`[DEBUG] Movie meta fetched: ${title}`);

    return {
      id: id,
      type: "movie",
      name: title,
      background: posterUrl || undefined,
      description: description,
      releaseInfo: year,
    };
  } catch (error) {
    console.error("[ERROR] Failed to fetch movie meta:", error.message);
    return { meta: {} };
  }
}

// Get movie streams using get__watch__server API (same as series)
async function getMovieStreams(id) {
  try {
    const movieUrl = Buffer.from(id.replace("asd:", ""), "base64").toString();
    console.log(`[DEBUG] ========== MOVIE STREAMS REQUEST ==========`);
    console.log(`[DEBUG] Movie URL: ${movieUrl}`);

    // Step 1: Get movie page to extract CSRF token
    const response = await axios.get(movieUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    const cookies = response.headers["set-cookie"]?.join("; ") || "";
    const $ = cheerio.load(response.data);

    // Extract CSRF token
    let csrfToken = "";
    $("script").each((i, elem) => {
      const scriptContent = $(elem).html();
      if (scriptContent) {
        const match = scriptContent.match(
          /main__obj\s*=\s*{[^}]*'csrf__token'\s*:\s*"([a-zA-Z0-9]+)"/
        );
        if (match && match[1]) {
          csrfToken = match[1];
          return false;
        }
      }
    });
    console.log(`[DEBUG] CSRF Token: ${csrfToken || "NOT FOUND"}`);

    // Step 2: Get watch page
    const watchBtnHref = $("a.watch__btn").attr("href");
    if (!watchBtnHref) {
      console.log("[DEBUG] No watch__btn found");
      return { streams: [] };
    }

    const watchUrl = watchBtnHref.startsWith("http")
      ? watchBtnHref
      : `${BASE_URL}${watchBtnHref}`;
    console.log(`[DEBUG] Watch URL: ${watchUrl}`);

    const watchResponse = await axios.get(watchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookies,
      },
      timeout: 10000,
    });

    const $watch = cheerio.load(watchResponse.data);

    // Extract post_id
    let postId =
      $watch(".watch__player").attr("data-id") ||
      $watch("[data-post]").attr("data-post") ||
      $watch("[data-id]").first().attr("data-id");

    if (!postId) {
      $watch("script").each((i, elem) => {
        const scriptContent = $watch(elem).html();
        if (scriptContent && !postId) {
          const match = scriptContent.match(/post_id["\s:=]+(\d+)/i);
          if (match && match[1]) {
            postId = match[1];
            return false;
          }
        }
      });
    }

    console.log(`[DEBUG] Post ID: ${postId || "NOT FOUND"}`);

    if (!postId) {
      console.log("[ERROR] Missing post_id, cannot fetch streams");
      return { streams: [] };
    }

    // Extract qualities
    const qualities = [];
    $watch("ul.qualities__list li").each((i, elem) => {
      const quality = $watch(elem).attr("data-quality");
      if (quality) {
        qualities.push(quality);
      }
    });

    const testQualities =
      qualities.length > 0 ? qualities : ["1080", "720", "480"];
    console.log(`[DEBUG] Qualities found: ${testQualities.join(", ")}`);

    // Step 3: Call get__watch__server API for each quality and server
    const streams = [];
    const processedUrls = new Set();

    for (const quality of testQualities) {
      // Test servers 0-4 for each quality
      for (let server = 0; server <= 4; server++) {
        try {
          const postData = new URLSearchParams();
          postData.append("post_id", postId);
          postData.append("quality", quality);
          postData.append("server", server);
          if (csrfToken) {
            postData.append("csrf_token", csrfToken);
          }

          console.log(`[DEBUG] API Call: quality=${quality}, server=${server}`);

          const apiResponse = await axios.post(
            `${BASE_URL}/get__watch__server/`,
            postData.toString(),
            {
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": USER_AGENT,
                "X-Requested-With": "XMLHttpRequest",
                Referer: watchUrl,
                Cookie: cookies,
                Accept: "application/json, text/javascript, */*; q=0.01",
                Origin: BASE_URL,
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Dest": "empty",
              },
              timeout: 12000,
            }
          );

          if (
            apiResponse.data &&
            apiResponse.data.type === "success" &&
            apiResponse.data.server
          ) {
            const embedUrl = apiResponse.data.server;
            console.log(`[DEBUG] API Response: ${embedUrl}`);

            // Skip if already processed
            if (processedUrls.has(embedUrl)) {
              console.log(`[DEBUG] Skipping duplicate URL`);
              continue;
            }
            processedUrls.add(embedUrl);

            // Determine driver based on URL
            let driver = "Unknown";
            let extractionUrl = embedUrl;

            if (embedUrl.includes("reviewrate.net")||embedUrl.includes("embed")) {
              driver = "arabseed";
            } else if (embedUrl.includes("m2.arabseed.one/play")) {
              driver = "arabseed-proxy";
            } else if (embedUrl.includes("vidmoly")) {
              driver = "vidmoly";
            } else if (embedUrl.includes("filemoon")) {
              driver = "filemoon";
            } else if (embedUrl.includes("voe.sx")) {
              driver = "voe";
            } else if (embedUrl.includes("savefiles")) {
              driver = "savefiles";
            }

            console.log(`[DEBUG] Determined driver: ${driver}`);

            const extractionResult = await extractVideoUrl(
              extractionUrl,
              driver
            );

            if (extractionResult && extractionResult.url) {
              streams.push({
                name: `ArabSeed`,
                title: `${quality}p - ${driver} (Server ${server})`,
                url: extractionResult.url,
                behaviorHints: extractionResult.behaviorHints || {},
              });
              console.log(`[DEBUG] ✓ Stream added: ${quality}p - ${driver}`);
            } else {
              console.log(`[DEBUG] ✗ Extraction failed for ${driver}`);
            }
          } else {
            console.log(
              `[DEBUG] API returned error or no server for quality=${quality}, server=${server}`
            );
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.error(
            `[ERROR] API call failed for quality=${quality}, server=${server}:`,
            error.message
          );
        }
      }
    }

    console.log(
      `[DEBUG] ========== Total streams found: ${streams.length} ==========`
    );
    return streams;
  } catch (error) {
    console.error("[ERROR] Failed to fetch movie streams:", error.message);
    return [];
  }
}

module.exports = { getMovies, getMovieMeta, getMovieStreams };
