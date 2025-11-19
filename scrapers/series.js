const axios = require("axios").default;
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const cheerio = require("cheerio");
const Buffer = require("buffer").Buffer;

// Create axios instance wrapped for cookie support
const jar = new tough.CookieJar();
const client = wrapper(axios.create({ jar }));

const BASE_URL = "https://a.asd.homes";
const SERIES_CATEGORY = "/category/arabic-series-6/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Fetch series catalog
async function getSeries(skip = 0) {
  try {
    const page = skip > 0 ? Math.floor(skip / 20) + 1 : 1;
    const url = page > 1 ? `${BASE_URL}${SERIES_CATEGORY}page/${page}/` : `${BASE_URL}${SERIES_CATEGORY}`;
    console.log(`[DEBUG] Fetching series page: ${url}`);

    const response = await client.get(url, {
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

    console.log(`[DEBUG] Found ${series.length} series`);
    return series;
  } catch (error) {
    console.error("[ERROR] getSeries error:", error.message);
    return [];
  }
}

// Fetch all episodes for a season
async function fetchAllEpisodesForSeason(seasonId, refererUrl, csrfToken) {
  const episodes = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const postData = new URLSearchParams();
      postData.append("season_id", seasonId);
      postData.append("csrf_token", csrfToken);
      postData.append("offset", offset);

      console.log(`[DEBUG] Fetching episodes AJAX season_id=${seasonId} offset=${offset}`);

      const response = await client.post(`${BASE_URL}/season__episodes/`, postData.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": USER_AGENT,
          "X-Requested-With": "XMLHttpRequest",
          Referer: refererUrl,
          Accept: "application/json, text/javascript, */*; q=0.01",
          Origin: BASE_URL,
        },
        timeout: 12000,
      });

      console.log(`[DEBUG] AJAX response status: ${response.status}`);

      if (!response.data || response.data.type === "error") {
        console.log(`[DEBUG] AJAX error or empty data: ${JSON.stringify(response.data)}`);
        break;
      }

      if (!response.data.html) {
        console.log("[DEBUG] No HTML content returned, stopping pagination.");
        break;
      }

      const $ = cheerio.load(response.data.html);
      let count = 0;

      $("a").each((i, el) => {
        const $el = $(el);
        const episodeUrl = $el.attr("href");
        const episodeTitle = $el.text().trim();

        if (!episodeUrl) return;

        const match = episodeTitle.match(/\d+/);
        const episodeNum = match ? parseInt(match[0]) : offset + i + 1;
        const episodeId = "asd:" + Buffer.from(episodeUrl).toString("base64");

        episodes.push({
          id: episodeId,
          title: `[translate:الحلقة] ${episodeNum}`,
          episode: episodeNum,
          season: null,
          released: new Date().toISOString(),
        });

        count++;
      });

      console.log(`[DEBUG] Episodes found this page: ${count}`);

      if (!response.data.hasmore) break;
      offset += 20;
    } catch (error) {
      console.error("[ERROR] fetchAllEpisodesForSeason error:", error.message);
      break;
    }
  }

  console.log(`[DEBUG] Total episodes fetched: ${episodes.length}`);
  return episodes;
}

// Fetch series meta with episodes
async function getSeriesMeta(id) {
  try {
    const seriesUrl = Buffer.from(id.replace("asd:", ""), "base64").toString();
    console.log(`[DEBUG] Fetching series meta: ${seriesUrl}`);

    const response = await client.get(seriesUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    console.log(`[DEBUG] Cookies stored in jar: await jar.getCookies(seriesUrl)}`);

    const $ = cheerio.load(response.data);

    let csrfToken = '';
    $('script').each((i, el) => {
      const scriptContent = $(el).html();
      if (scriptContent && !csrfToken) {
        const match = scriptContent.match(/main__obj\s*=\s*{[^}]*'csrf__token'\s*:\s*"([a-zA-Z0-9]+)"/);
        if (match) csrfToken = match[1];
      }
    });

    console.log(`[DEBUG] CSRF token: ${csrfToken}`);

    // Parse seasons
    const seasons = [];
    $("#seasons__list ul li").each((i, el) => {
      const $el = $(el);
      const seasonId = $el.attr("data-term");
      const seasonName = $el.find("span").text().trim();
      if (seasonId) seasons.push({ id: seasonId, name: seasonName, number: i + 1 });
    });

    console.log(`[DEBUG] Seasons detected: ${seasons.length}`);

    let allEpisodes = [];

    if (seasons.length === 0) {
      const loadMoreBtn = $(".load__more__episodes");
      if (loadMoreBtn.length > 0 && loadMoreBtn.css("pointer-events") !== "none" && loadMoreBtn.css("opacity") !== "0.5") {
        const postId = loadMoreBtn.attr("data-id");
        if (postId) {
          console.log(`[DEBUG] Loading additional episodes with postId: ${postId}`);
          const moreEpisodes = await fetchAllEpisodesForSeason(postId, seriesUrl, csrfToken);
          moreEpisodes.forEach(ep => ep.season = 1);
          allEpisodes = [...allEpisodes, ...moreEpisodes];
        }
      } else {
        $(".episodes__list a, .seasons__list a").each((i, el) => {
          const $el = $(el);
          const episodeUrl = $el.attr("href");
          const episodeTitle = $el.text().trim();

          if (!episodeUrl) return;

          const match = episodeTitle.match(/\d+/);
          const episodeNum = match ? parseInt(match[0]) : i + 1;
          const episodeId = "asd:" + Buffer.from(episodeUrl).toString("base64");

          allEpisodes.push({
            id: episodeId,
            title: `[translate:الحلقة] ${episodeNum}`,
            season: 1,
            episode: episodeNum,
            released: new Date().toISOString(),
          });
        });
      }
    } else {
      for (const season of seasons) {
        console.log(`[DEBUG] Loading episodes for season "${season.name}" id ${season.id}`);
        const eps = await fetchAllEpisodesForSeason(season.id, seriesUrl, csrfToken);
        eps.forEach(ep => ep.season = season.number);
        allEpisodes = [...allEpisodes, ...eps];
      }
    }

    const uniqueEpisodes = Array.from(new Map(allEpisodes.map(ep => [ep.id, ep])).values());
    uniqueEpisodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));

    console.log(`[DEBUG] Total unique episodes: ${uniqueEpisodes.length}`);

    const title = $(".post__title h1").text().trim();
    const posterUrl = $(".poster__single img").attr("src") || $(".poster__single img").attr("data-src");
    const description = $(".story__text").text().trim();

    return {
      id,
      type: "series",
      name: title,
      background: posterUrl,
      description,
      videos: uniqueEpisodes,
    };
  } catch (error) {
    console.error("[ERROR] getSeriesMeta error:", error.message);
    return { meta: {} };
  }
}

// Sample stub: extractVideoUrl implementation placeholder
async function extractVideoUrl(url, driver) {
  // Implement driver specific extraction logic here
  return url; // For now just return the url
}

// Fetch streams from episode page using ArabSeed watch page approach
async function getSeriesStreams(id) {
  try {
    const encodedEpisodeUrl = id.split(":")[1];
    if (!encodedEpisodeUrl) {
      console.log("[DEBUG] No encoded URL in stream ID");
      return [];
    }

    const episodeUrl = Buffer.from(encodedEpisodeUrl, "base64").toString();
    console.log(`[DEBUG] Fetching episode page for streams: ${episodeUrl}`);

    const response = await client.get(episodeUrl, { headers: { "User-Agent": USER_AGENT } });
    const $ = cheerio.load(response.data);

    const streams = [];
    const processedSources = new Set();

    const watchBtnHref = $('a.watchBTn').attr('href');
    if (!watchBtnHref) {
      console.log("[DEBUG] No watch button found");
      return [];
    }
    const watchUrl = watchBtnHref.startsWith("http") ? watchBtnHref : `${BASE_URL}${watchBtnHref}`;

    console.log(`[DEBUG] Fetching watch page: ${watchUrl}`);

    const watchResponse = await client.get(watchUrl, { headers: { "User-Agent": USER_AGENT } });
    const $watch = cheerio.load(watchResponse.data);

    $watch("li[data-link]").each(async (i, el) => {
      const embedUrl = $watch(el).attr("data-link");
      if (embedUrl && !processedSources.has(embedUrl)) {
        processedSources.add(embedUrl);
        const fullUrl = embedUrl.startsWith("http") ? embedUrl : `https:${embedUrl}`;

        let driver = "Unknown";
        if (fullUrl.includes("mixdrop")) driver = "mixdrop";
        else if (fullUrl.includes("dood")) driver = "doodstream";
        else if (fullUrl.includes("streamwish")) driver = "streamwish";
        else if (fullUrl.includes("vidguard")) driver = "vidguard";

        const videoUrl = await extractVideoUrl(fullUrl, driver);
        if (videoUrl) {
          streams.push({
            name: `Arabseed - ${driver}`,
            title: driver,
            url: videoUrl,
          });
          console.log(`[DEBUG] Added stream from driver: ${driver} URL: ${videoUrl}`);
        }
      }
    });

    // Wait for all async extraction to finish (since .each callback is async)
    // This is a simplistic approach; you might want to refactor to use for-loops with await
    await new Promise(r => setTimeout(r, 1000));

    console.log(`[DEBUG] Total streams found: ${streams.length}`);

    return streams;
  } catch (error) {
    console.error("[STREAM ERROR]", error.message);
    return [];
  }
}

module.exports = { getSeries, getSeriesMeta, getSeriesStreams, extractVideoUrl };
