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
        description: description || `مسلسل ${title}`,
      });
    });

    console.log(`[DEBUG] Total series parsed: ${series.length}`);
    return series;
  } catch (error) {
    console.error(`[ERROR] Failed to fetch series catalog:`, error);
    return [];
  }
}

// Fetch all episodes for a season using AJAX
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
          title: `الحلقة ${episodeNum}`,
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

// Get series metadata and episodes
async function getSeriesMeta(id) {
  const seriesUrl = Buffer.from(id.replace("asd:", ""), "base64").toString();

  try {
    console.log(`[DEBUG] Fetching series meta for URL: ${seriesUrl}`);

    const response = await axios.get(seriesUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    const cookies = response.headers['set-cookie']?.join('; ') || '';
    console.log(`[DEBUG] Cookies captured: ${cookies.substring(0, 100)}...`);

    const $ = cheerio.load(response.data);

    // Extract CSRF token
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
      if (loadMoreBtn.length > 0 && loadMoreBtn.css("pointer-events") !== "none" && loadMoreBtn.css("opacity") !== "0.5") {
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
            title: `الحلقة ${episodeNum}`,
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
      videos: uniqueEpisodes 
    };
  } catch (error) {
    console.error(`[ERROR] Failed to fetch series meta for ID ${id}:`, error.message);
    return { meta: {} };
  }
}

// Extract from Arabseed server using reviewrate.net -> gamehub.cam conversion
async function extractArabseedServer(embedCode) {
  try {
    // Convert reviewrate.net URL to gamehub.cam URL
    const gamehubUrl = embedCode.replace('https://m.reviewrate.net/', 'https://w5.gamehub.cam/');
    console.log(`[DEBUG] ArabseedServer: Original URL: ${embedCode}`);
    console.log(`[DEBUG] ArabseedServer: Converted to Gamehub URL: ${gamehubUrl}`);

    // const response = await axios.get(gamehubUrl, {
    //   headers: { "User-Agent": USER_AGENT, Referer: BASE_URL },
    //   timeout: 10000,
    // });

    // const $ = cheerio.load(response.data);
    // const iframeSrc = $('iframe').attr('src');
    // console.log(`[DEBUG] ArabseedServer: Found iframe src: ${iframeSrc}`);

    // if (!iframeSrc) {
    //   console.log("[DEBUG] ArabseedServer: No iframe found in gamehub response");
    //   return null;
    // }

    // const fullIframeUrl = iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`;
    // console.log(`[DEBUG] ArabseedServer: Full iframe URL: ${fullIframeUrl}`);

    const playerResponse = await axios.get(embedCode, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: BASE_URL
      },
      timeout: 10000,
    });

    const $player = cheerio.load(playerResponse.data);
    const videoSrc = $player('video source').attr('src') || $player('source').attr('src');

    if (videoSrc) {
      console.log(`[DEBUG] ArabseedServer: ✓ Video URL found: ${videoSrc}`);

      // Use proxy URL with encoded video URL
      const proxyUrl = `https://arabseed-catalogue.vercel.app/proxy/arabseed?url=${encodeURIComponent(videoSrc)}`;
      console.log(`[DEBUG] ArabseedServer: Using proxy URL`);

      return {
        url: proxyUrl,
        behaviorHints: {
          notWebReady: false,
          bingeGroup: "arabseed-server"
        }
      };
    }

    console.log("[DEBUG] ArabseedServer: No video source found in player page");
    return null;
  } catch (error) {
    console.error(`[ERROR] Arabseed server extraction failed:`, error.message);
    return null;
  }
}

// Handle m2.arabseed.one proxy URLs
async function extractArabseedProxy(url) {
  try {
    console.log(`[DEBUG] ArabseedProxy: Extracting from: ${url}`);
    const urlObj = new URL(url);
    const encodedId = urlObj.searchParams.get('id');

    if (!encodedId) {
      console.log("[DEBUG] ArabseedProxy: No id parameter found");
      return null;
    }

    const decodedUrl = Buffer.from(encodedId, 'base64').toString();
    console.log(`[DEBUG] ArabseedProxy: Decoded URL: ${decodedUrl}`);

    if (decodedUrl.includes('savefiles')) {
      return await extractSavefiles(decodedUrl);
    } else if (decodedUrl.includes('voe.sx')) {
      return await extractVoe(decodedUrl);
    } else if (decodedUrl.includes('filemoon')) {
      return await extractFilemoon(decodedUrl);
    } else if (decodedUrl.includes('vidmoly')) {
      return await extractVidmoly(decodedUrl);
    }

    console.log(`[DEBUG] ArabseedProxy: Unknown host in decoded URL`);
    return null;
  } catch (error) {
    console.error(`[ERROR] Arabseed proxy extraction failed:`, error.message);
    return null;
  }
}

// Extract from Vidmoly
async function extractVidmoly(url) {
  try {
    console.log(`[DEBUG] Vidmoly: Extracting from: ${url}`);
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const html = response.data;
    const patterns = [
      /sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/,
      /file\s*:\s*"([^"]+\.m3u8[^"]*)"/,
      /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        console.log(`[DEBUG] Vidmoly: ✓ Video URL found`);
        return {
          url: match[1],
          behaviorHints: {
            notWebReady: true,
            bingeGroup: "vidmoly"
          }
        };
      }
    }

    console.log(`[DEBUG] Vidmoly: No video URL found`);
    return null;
  } catch (error) {
    console.error(`[ERROR] Vidmoly extraction failed:`, error.message);
    return null;
  }
}

// Extract from Filemoon
async function extractFilemoon(url) {
  try {
    console.log(`[DEBUG] Filemoon: Extracting from: ${url}`);
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const html = response.data;

    let sourceUrl = $('source[type="application/vnd.apple.mpegurl"]').attr('src') ||
      $('source[type="application/x-mpegURL"]').attr('src') ||
      $('source').attr('src');

    if (sourceUrl) {
      sourceUrl = sourceUrl.startsWith('http') ? sourceUrl : `https:${sourceUrl}`;
      console.log(`[DEBUG] Filemoon: ✓ Source URL found from HTML`);
      return {
        url: sourceUrl,
        behaviorHints: {
          notWebReady: true,
          bingeGroup: "filemoon"
        }
      };
    }

    const patterns = [
      /file\s*:\s*"([^"]+\.m3u8[^"]*)"/,
      /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/,
      /sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        console.log(`[DEBUG] Filemoon: ✓ Video URL found from regex`);
        const finalUrl = match[1].startsWith('http') ? match[1] : `https:${match[1]}`;
        return {
          url: finalUrl,
          behaviorHints: {
            notWebReady: true,
            bingeGroup: "filemoon"
          }
        };
      }
    }

    console.log(`[DEBUG] Filemoon: No video URL found`);
    return null;
  } catch (error) {
    console.error(`[ERROR] Filemoon extraction failed:`, error.message);
    return null;
  }
}

// Extract from Voe.sx
async function extractVoe(url) {
  try {
    console.log(`[DEBUG] Voe.sx: Extracting from: ${url}`);
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const html = response.data;
    const patterns = [
      /'hls'\s*:\s*'([^']+\.m3u8[^']*)'/,
      /"hls"\s*:\s*"([^"]+\.m3u8[^"]*)"/,
      /prompt\([^)]*\);[^}]*sources\s*:\s*\{\s*hls\s*:\s*'([^']+)'/,
      /video_link\s*=\s*"([^"]+\.m3u8[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        console.log(`[DEBUG] Voe.sx: ✓ Video URL found`);
        return {
          url: match[1],
          behaviorHints: {
            notWebReady: true,
            bingeGroup: "voe"
          }
        };
      }
    }

    console.log(`[DEBUG] Voe.sx: No video URL found`);
    return null;
  } catch (error) {
    console.error(`[ERROR] Voe.sx extraction failed:`, error.message);
    return null;
  }
}

// Extract from Savefiles
async function extractSavefiles(url) {
  try {
    console.log(`[DEBUG] Savefiles: Extracting from: ${url}`);
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const html = response.data;

    let sourceUrl = $('video source').attr('src') || $('source').attr('src');

    if (sourceUrl) {
      sourceUrl = sourceUrl.startsWith('http') ? sourceUrl : `https:${sourceUrl}`;
      console.log(`[DEBUG] Savefiles: ✓ Source URL found`);
      return {
        url: sourceUrl,
        behaviorHints: {
          notWebReady: true,
          bingeGroup: "savefiles"
        }
      };
    }

    const patterns = [
      /file\s*:\s*"([^"]+\.(m3u8|mp4)[^"]*)"/,
      /"file"\s*:\s*"([^"]+\.(m3u8|mp4)[^"]*)"/,
      /sources\s*:\s*\[\s*"([^"]+)"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        console.log(`[DEBUG] Savefiles: ✓ Video URL found`);
        return {
          url: match[1],
          behaviorHints: {
            notWebReady: true,
            bingeGroup: "savefiles"
          }
        };
      }
    }

    console.log(`[DEBUG] Savefiles: No video URL found`);
    return null;
  } catch (error) {
    console.error(`[ERROR] Savefiles extraction failed:`, error.message);
    return null;
  }
}

// Generic extraction fallback
async function extractGeneric(url) {
  try {
    console.log(`[DEBUG] Generic: Extracting from: ${url}`);
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT, Referer: url },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const html = response.data;

    let sourceUrl = $('video source').attr('src') || $('source').attr('src');

    if (sourceUrl) {
      sourceUrl = sourceUrl.startsWith('http') ? sourceUrl : `https:${sourceUrl}`;
      console.log(`[DEBUG] Generic: ✓ Source URL found`);
      return {
        url: sourceUrl,
        behaviorHints: {
          notWebReady: true
        }
      };
    }

    const patterns = [
      /file\s*:\s*"([^"]+\.(m3u8|mp4)[^"]*)"/,
      /"file"\s*:\s*"([^"]+\.(m3u8|mp4)[^"]*)"/,
      /sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        console.log(`[DEBUG] Generic: ✓ Video URL found`);
        return {
          url: match[1],
          behaviorHints: {
            notWebReady: true
          }
        };
      }
    }

    console.log(`[DEBUG] Generic: No video URL found`);
    return null;
  } catch (error) {
    console.error(`[ERROR] Generic extraction failed:`, error.message);
    return null;
  }
}

// Main extractor router
async function extractVideoUrl(embedUrl, driver) {
  console.log(`[DEBUG] extractVideoUrl: Driver=${driver}, URL=${embedUrl}`);
  let result = null;

  try {
    if (driver === 'arabseed') {
      result = await extractArabseedServer(embedUrl);
    } else if (driver === 'arabseed-proxy') {
      result = await extractArabseedProxy(embedUrl);
    } else if (driver === 'vidmoly') {
      result = await extractVidmoly(embedUrl);
    } else if (driver === 'filemoon') {
      result = await extractFilemoon(embedUrl);
    } else if (driver === 'voe') {
      result = await extractVoe(embedUrl);
    } else if (driver === 'savefiles') {
      result = await extractSavefiles(embedUrl);
    } else {
      console.log(`[DEBUG] Unknown driver: ${driver}, skipping`);
      return null;
    }

    if (result && result.url) {
      console.log(`[DEBUG] ✓ ${driver} extraction successful`);
    } else {
      console.log(`[DEBUG] ✗ ${driver} extraction returned null`);
    }

    return result;
  } catch (error) {
    console.error(`[ERROR] extractVideoUrl failed for ${driver}:`, error.message);
    return null;
  }
}

// NEW: Get series streams using get__watch__server API
async function getSeriesStreams(id) {
  try {
    const encodedEpisodeUrl = id.split(":")[1];
    if (!encodedEpisodeUrl) {
      console.log(`[DEBUG] No URL found in series stream ID: ${id}`);
      return { streams: [] };
    }

    const episodeUrl = Buffer.from(encodedEpisodeUrl, "base64").toString();
    console.log(`[DEBUG] ========== STREAMS REQUEST ==========`);
    console.log(`[DEBUG] Episode URL: ${episodeUrl}`);

    // Step 1: Get episode page to extract CSRF token
    const response = await axios.get(episodeUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000
    });

    const cookies = response.headers['set-cookie']?.join('; ') || '';
    const $ = cheerio.load(response.data);

    // Extract CSRF token
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
    console.log(`[DEBUG] CSRF Token: ${csrfToken || 'NOT FOUND'}`);

    // Step 2: Get watch page
    const watchBtnHref = $('a.watch__btn').attr('href');
    if (!watchBtnHref) {
      console.log("[DEBUG] No watch__btn found");
      return { streams: [] };
    }

    const watchUrl = watchBtnHref.startsWith('http') ? watchBtnHref : `${BASE_URL}${watchBtnHref}`;
    console.log(`[DEBUG] Watch URL: ${watchUrl}`);

    const watchResponse = await axios.get(watchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Cookie": cookies
      },
      timeout: 10000
    });

    const $watch = cheerio.load(watchResponse.data);

    // Extract post_id
    let postId = $watch('.watch__player').attr('data-id') ||
      $watch('[data-post]').attr('data-post') ||
      $watch('[data-id]').first().attr('data-id');

    if (!postId) {
      $watch('script').each((i, elem) => {
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

    console.log(`[DEBUG] Post ID: ${postId || 'NOT FOUND'}`);

    if (!postId) {
      console.log("[ERROR] Missing post_id, cannot fetch streams");
      return { streams: [] };
    }

    // Extract qualities
    const qualities = [];
    $watch('ul.qualities__list li').each((i, elem) => {
      const quality = $watch(elem).attr('data-quality');
      if (quality) {
        qualities.push(quality);
      }
    });

    const testQualities = qualities.length > 0 ? qualities : ['720', '480'];
    console.log(`[DEBUG] Qualities found: ${testQualities.join(', ')}`);

    // Step 3: Call get__watch__server API for each quality and server
    const streams = [];
    const processedUrls = new Set();

    for (const quality of testQualities) {
      // Only test server 0-4 (most reliable servers)
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
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": USER_AGENT,
                "X-Requested-With": "XMLHttpRequest",
                "Referer": watchUrl,
                "Cookie": cookies,
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Origin": BASE_URL,
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Dest": "empty",
              },
              timeout: 12000,
            }
          );

          if (apiResponse.data && apiResponse.data.type === 'success' && apiResponse.data.server) {
            const embedUrl = apiResponse.data.server;
            console.log(`[DEBUG] API Response: ${embedUrl}`);

            // Skip if already processed
            if (processedUrls.has(embedUrl)) {
              console.log(`[DEBUG] Skipping duplicate URL`);
              continue;
            }
            processedUrls.add(embedUrl);

            // Determine driver based on URL
            let driver = 'Unknown';
            let extractionUrl = embedUrl;

            if (embedUrl.includes('reviewrate.net')) {
              driver = 'arabseed';
              // URL will be converted inside extractArabseedServer
            } else if (embedUrl.includes('m2.arabseed.one/play')) {
              driver = 'arabseed-proxy';
            } else if (embedUrl.includes('vidmoly')) {
              driver = 'vidmoly';
            } else if (embedUrl.includes('filemoon')) {
              driver = 'filemoon';
            } else if (embedUrl.includes('voe.sx')) {
              driver = 'voe';
            } else if (embedUrl.includes('savefiles')) {
              driver = 'savefiles';
            }

            console.log(`[DEBUG] Determined driver: ${driver}`);

            const extractionResult = await extractVideoUrl(extractionUrl, driver);

            if (extractionResult && extractionResult.url) {
              streams.push({
                name: `ArabSeed`,
                title: `${quality}p - ${driver} (Server ${server})`,
                url: extractionResult.url,
                behaviorHints: extractionResult.behaviorHints || {}
              });
              console.log(`[DEBUG] ✓ Stream added: ${quality}p - ${driver}`);
            } else {
              console.log(`[DEBUG] ✗ Extraction failed for ${driver}`);
            }
          } else {
            console.log(`[DEBUG] API returned error or no server for quality=${quality}, server=${server}`);
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          console.error(`[ERROR] API call failed for quality=${quality}, server=${server}:`, error.message);
        }
      }
    }

    console.log(`[DEBUG] ========== Total streams found: ${streams.length} ==========`);
    return { streams };

  } catch (error) {
    console.error('[STREAM ERROR]', error.message);
    return { streams: [] };
  }
}

module.exports = {
  getSeries,
  getSeriesMeta,
  getSeriesStreams,
  extractVideoUrl,
};
