const axios = require("axios");
const cheerio = require("cheerio");
const Buffer = require("buffer").Buffer;

const BASE_URL = "https://a.asd.homes";
const SERIES_CATEGORY = "/category/arabic-series-6/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Fetch series list
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

// Fetch all episodes for a season via AJAX pagination
async function fetchAllEpisodesForSeason(seasonId, refererUrl, csrfToken, cookies) {
  const episodes = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const postData = new URLSearchParams();
      postData.append("season_id", seasonId);
      postData.append("csrf_token", csrfToken);
      postData.append("offset", offset);

      console.log(`[DEBUG] Sending AJAX POST for episodes. SeasonId: ${seasonId}, Offset: ${offset}`);

      const response = await axios.post(
        `${BASE_URL}/season__episodes/`,
        postData.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            Referer: refererUrl,
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

      if (!response.data || response.data.type === "error") {
        console.log(`[DEBUG] AJAX returned error or no data: ${JSON.stringify(response.data)}`);
        break;
      }

      if (!response.data.html) {
        console.log("[DEBUG] No HTML content in episodes AJAX response, stopping pagination.");
        break;
      }

      const $ = cheerio.load(response.data.html);

      let episodesFoundOnPage = 0;
      $("a").each((i, elem) => {
        const $elem = $(elem);
        const episodeUrl = $elem.attr("href");
        const episodeTitle = $elem.text().trim();

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

        episodesFoundOnPage++;
      });

      console.log(`[DEBUG] Episodes found this page: ${episodesFoundOnPage}`);

      hasMore = response.data.hasmore === true || response.data.hasmore === "true";
      offset += 20;
    } catch (error) {
      console.error(`[ERROR] Failed AJAX episode fetch for season ${seasonId} offset ${offset}:`, error.message);
      break;
    }
  }

  console.log(`[DEBUG] Total episodes fetched for season ${seasonId}: ${episodes.length}`);
  return episodes;
}

// Fetch series metadata including episodes and seasons
async function getSeriesMeta(id) {
  try {
    const seriesUrl = Buffer.from(id.replace("asd:", ""), "base64").toString();
    console.log(`[DEBUG] Fetching series meta for URL: ${seriesUrl}`);

    const response = await axios.get(seriesUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    const cookies = response.headers['set-cookie']?.join('; ') || '';
    console.log(`[DEBUG] Cookies captured: ${cookies.substring(0, 100)}...`);

    const $ = cheerio.load(response.data);

    let csrfToken = '';
    $('script').each((i, elem) => {
      const scriptContent = $(elem).html();
      if (scriptContent) {
        const match = scriptContent.match(/main__obj\s*=\s*{[^}]*'csrf__token'\s*:\s*"([a-zA-Z0-9]+)"/);
        if (match && match[1]) {
          csrfToken = match[1];
          return false;
        }
      }
    });
    console.log(`[DEBUG] Extracted CSRF token from main__obj: ${csrfToken || 'NOT FOUND'}`);

    const title = $(".post__title h1").text().trim();
    const posterUrl = $(".poster__single img").attr("src") || $(".poster__single img").attr("data-src");
    const description = $(".story__text").text().trim();

    const seasons = [];
    $("#seasons__list ul li").each((i, elem) => {
      const $elem = $(elem);
      const seasonId = $elem.attr("data-term");
      const seasonName = $elem.find("span").text().trim();

      if (seasonId) {
        seasons.push({
          id: seasonId,
          name: seasonName,
          number: i + 1,
        });
      }
    });

    console.log(`[DEBUG] Seasons detected: ${seasons.length}`);

    let allEpisodes = [];

    if (seasons.length === 0) {
      const loadMoreBtn = $(".load__more__episodes");
      if (loadMoreBtn.length > 0 &&
          loadMoreBtn.css("pointer-events") !== "none" &&
          loadMoreBtn.css("opacity") !== "0.5") {
        const postId = loadMoreBtn.attr("data-id");
        if (postId) {
          console.log(`[DEBUG] Load more episodes button enabled with postId: ${postId}`);
          const moreEpisodes = await fetchAllEpisodesForSeason(postId, seriesUrl, csrfToken, cookies);
          moreEpisodes.forEach(ep => ep.season = 1);
          allEpisodes = [...allEpisodes, ...moreEpisodes];
        } else {
          console.log("[DEBUG] Load more button found but missing data-id.");
        }
      } else {
        console.log("[DEBUG] No active load more button, reading episodes from HTML");
        $(".episodes__list a, .seasons__list a").each((i, elem) => {
          const $elem = $(elem);
          const episodeUrl = $elem.attr("href");
          const episodeTitle = $elem.text().trim();

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
        console.log(`[DEBUG] Fetching episodes for season "${season.name}" with ID: ${season.id}`);
        const episodes = await fetchAllEpisodesForSeason(season.id, seriesUrl, csrfToken, cookies);
        episodes.forEach(ep => ep.season = season.number);
        allEpisodes = [...allEpisodes, ...episodes];
      }
    }

    const uniqueEpisodes = Array.from(new Map(allEpisodes.map(ep => [ep.id, ep])).values());
    uniqueEpisodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));

    console.log(`[DEBUG] Total unique episodes gathered: ${uniqueEpisodes.length}`);

    return {
      id,
      type: "series",
      name: title,
      background: posterUrl || undefined,
      description,
      videos: uniqueEpisodes,
    };
  } catch (error) {
    console.error(`[ERROR] Failed to fetch series meta for ID ${id}:`, error.message);
    return { meta: {} };
  }
}

// Extract playable video URL from embed page URL according to driver
async function extractVideoUrl(url, driver) {
  console.log(`[DEBUG] Extracting video URL for driver: ${driver}, url: ${url}`);

  try {
    if (driver === 'vidmoly') {
      // Example vidmoly.net extraction logic
      const response = await axios.get(url, { headers: { "User-Agent": USER_AGENT }, timeout: 10000 });
      const $ = cheerio.load(response.data);

      // Vidmoly typically has a script with sources array, find it
      const scriptContent = $('script')
        .map((i, el) => $(el).html())
        .get()
        .find(sc => sc && sc.includes('sources'));

      if (scriptContent) {
        const match = scriptContent.match(/sources\s*:\s*(\[[^\]]+\])/);
        if (match && match[1]) {
          const sourcesJson = match[1].replace(/'/g, '"'); // normalize quotes for JSON parse
          const sources = JSON.parse(sourcesJson);
          if (Array.isArray(sources) && sources.length > 0) {
            console.log(`[DEBUG] vidmoly sources found`);
            return sources[0].file; // return the first source URL (usually .m3u8 or mp4)
          }
        }
      }
      console.log(`[DEBUG] vidmoly: No sources found in embed page`);
      return url; // fallback to original if none found
    }
    else if (driver === 'filemoon') {
      // Example filemoon.sx extraction (simplified)
      const response = await axios.get(url, { headers: { "User-Agent": USER_AGENT }, timeout: 10000 });
      const $ = cheerio.load(response.data);

      const sourceTag = $('source[type="application/vnd.apple.mpegurl"]').attr('src') ||
                        $('source[type="application/x-mpegURL"]').attr('src');
      if (sourceTag) {
        console.log(`[DEBUG] filemoon source URL found: ${sourceTag}`);
        return sourceTag.startsWith('http') ? sourceTag : `https:${sourceTag}`;
      }
      console.log(`[DEBUG] filemoon: No valid source tag found`);
      return url;
    }
    else if (driver === 'doodstream') {
      // Placeholder: doodstream extraction logic to be implemented
      // For demo, just return URL
      console.log(`[DEBUG] doodstream extractor: returning URL as is`);
      return url;
    }
    else if (driver === 'mixdrop') {
      // Placeholder: mixdrop extraction logic to be implemented
      console.log(`[DEBUG] mixdrop extractor: returning URL as is`);
      return url;
    }
    else if (driver === 'streamwish') {
      console.log(`[DEBUG] streamwish extractor: returning URL as is`);
      return url;
    }
    else if (driver === 'vidguard') {
      console.log(`[DEBUG] vidguard extractor: returning URL as is`);
      return url;
    }
    else {
      console.log(`[DEBUG] Unknown driver or no extractor implemented, return original url`);
      return url;
    }
  } catch (err) {
    console.error(`[ERROR] extractVideoUrl failed for driver ${driver} and url ${url}:`, err.message);
    return url;
  }
}

// Fetch streams for a given episode
async function getSeriesStreams(id) {
  try {
    const encodedEpisodeUrl = id.split(":")[1];
    if (!encodedEpisodeUrl) {
      console.log(`[DEBUG] No URL found in series stream ID: ${id}`);
      return [];
    }

    const episodeUrl = Buffer.from(encodedEpisodeUrl, "base64").toString();
    console.log(`[DEBUG] Fetching streams from episode URL: ${episodeUrl}`);

    // Fetch watch page
    const response = await axios.get(episodeUrl, { headers: { "User-Agent": USER_AGENT }, timeout: 10000 });
    const $ = cheerio.load(response.data);

    // Corrected selector for watch button class
    const watchBtnHref = $('a.watch__btn').attr('href');
    console.log(`[DEBUG] watch__btn href: ${watchBtnHref}`);

    if (watchBtnHref) {
      const watchUrl = watchBtnHref.startsWith('http') ? watchBtnHref : `${BASE_URL}${watchBtnHref}`;
      console.log(`[DEBUG] Full watch URL: ${watchUrl}`);

      const watchResponse = await axios.get(watchUrl, { headers: { 'User-Agent': USER_AGENT }, timeout: 10000 });
      const $watch = cheerio.load(watchResponse.data);

      const liElements = $watch('li[data-link]');
      console.log(`[DEBUG] Found ${liElements.length} li elements with data-link`);

      const streams = [];
      const processedSources = new Set();

      for (let i = 0; i < liElements.length; i++) {
        const el = liElements[i];
        const $el = $watch(el);
        const embedUrl = $el.attr('data-link');
        console.log(`[DEBUG] li[${i}] embedUrl: ${embedUrl}`);

        if (embedUrl && !processedSources.has(embedUrl)) {
          processedSources.add(embedUrl);
          const fullUrl = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
          console.log(`[DEBUG] Full embed URL: ${fullUrl}`);

          let driver = 'Unknown';
          if (fullUrl.includes('mixdrop')) driver = 'mixdrop';
          else if (fullUrl.includes('dood')) driver = 'doodstream';
          else if (fullUrl.includes('streamwish')) driver = 'streamwish';
          else if (fullUrl.includes('vidguard')) driver = 'vidguard';
          else if (fullUrl.includes('vidmoly')) driver = 'vidmoly';
          else if (fullUrl.includes('filemoon')) driver = 'filemoon';

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
    console.error('[STREAM ERROR]', error.message);
    return [];
  }
}

module.exports = {
  getSeries,
  getSeriesMeta,
  getSeriesStreams,
  extractVideoUrl,
};
