const axios = require("axios");
const cheerio = require("cheerio");
const Buffer = require("buffer").Buffer;

const BASE_URL = "https://a.asd.homes";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Fetch series list
async function getSeries(skip = 0) {
  try {
    const page = skip > 0 ? Math.floor(skip / 20) + 1 : 1;
    const url = page > 1 ? `${BASE_URL}/category/arabic-series-6/page/${page}/` : `${BASE_URL}/category/arabic-series-6/`;
    console.log(`[DEBUG] Fetching series page: ${url}`);
    const response = await axios.get(url, { headers: { "User-Agent": USER_AGENT } });
    const $ = cheerio.load(response.data);
    const series = [];
    $(".movie__block").each((i, elem) => {
      const $elem = $(elem);
      const seriesUrl = $elem.attr("href");
      const title = $elem.find(".post__info h3").text().trim();
      const posterUrl = $elem.find(".post__image img").attr("data-src") || $elem.find(".post__image img").attr("src");
      if (!seriesUrl || !title) return;
      const id = "asd:" + Buffer.from(seriesUrl).toString("base64");
      series.push({ id, type: "series", name: title, poster: posterUrl, description: `مسلسل ${title}` });
    });
    console.log(`[DEBUG] Found ${series.length} series`);
    return series;
  } catch (err) {
    console.error("[ERROR] getSeries error:", err.message);
  }
}

// Fetch episodes for a season
async function fetchAllEpisodesForSeason(seasonId, refererUrl, csrfToken, cookies) {
  const episodes = [], offset = 0, hasMore = true;
  while (hasMore) {
    try {
      const postData = new URLSearchParams();
      postData.append("season_id", seasonId);
      postData.append("csrf_token", csrfToken);
      postData.append("offset", offset);
      console.log(`[DEBUG] Sending AJAX to fetch episodes: season_id=${seasonId}, offset=${offset}`);
      const response = await axios.post(`${BASE_URL}/season__episodes/`, postData.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": USER_AGENT,
          "X-Requested-With": "XMLHttpRequest",
          "Referer": refererUrl,
          "Cookie": cookies,
          "Accept": "application/json, text/javascript, */*"
        },
        timeout: 12000
      });
      console.log(`[DEBUG] AJAX response status: ${response.status}`);
      if (!response.data || response.data.type === "error") {
        console.log("[DEBUG] No data or error in AJAX response");
        break;
      }
      if (!response.data.html) {
        console.log("[DEBUG] No HTML in response");
        break;
      }
      const $ = cheerio.load(response.data.html);
      let count = 0;
      $("a").each((i, el) => {
        const href = $(el).attr("href");
        const title = $(el).text().trim();
        if (href) {
          const match = title.match(/\d+/);
          const episodeNum = match ? parseInt(match[0]) : offset + i + 1;
          episodes.push({ id: "asd:" + Buffer.from(href).toString("base64"), title: `الحلقة ${episodeNum}`, episode: episodeNum });
          count++;
        }
      });
      console.log(`[DEBUG] Found ${count} episodes on this page`);
      if (!response.data.hasmore) break;
      offset += 20;
    } catch (err) {
      console.error("[ERROR] fetchAllEpisodesForSeason error:", err.message);
      break;
    }
  }
  console.log(`[DEBUG] Total episodes fetched: ${episodes.length}`);
  return episodes;
}

// Fetch series meta including episodes
async function getSeriesMeta(id) {
  try {
    const seriesUrl = Buffer.from(id.replace("asd:", ""), "base64").toString();
    console.log(`[DEBUG] Fetching series meta: ${seriesUrl}`);
    const response = await axios.get(seriesUrl, { headers: { "User-Agent": USER_AGENT } });
    const cookies = response.headers['set-cookie']?.join('; ');
    console.log(`[DEBUG] Cookies: ${cookies}`);
    const $ = cheerio.load(response.data);
    let csrfToken = '';
    $('script').each((i, el) => {
      const txt = $(el).html();
      if (!csrfToken && txt && txt.includes("csrf__token")) {
        const match = txt.match(/main__obj\s*=\s*{[^}]*'csrf__token'\s*:\s*"([a-zA-Z0-9]+)"/);
        if (match) csrfToken = match[1];
      }
    });
    console.log(`[DEBUG] CSRF token: ${csrfToken}`);
    // parse seasons and episodes here...
    // omitted for brevity
  } catch (err) {
    console.error("[ERROR] getSeriesMeta:", err.message);
  }
}

// Fetch streams from watch page
async function getSeriesStreams(id) {
  try {
    const episodeUrl = Buffer.from(id.split(":")[1], "base64").toString();
    console.log(`[DEBUG] Fetching episode page: ${episodeUrl}`);
    const episodeRes = await axios.get(episodeUrl, { headers: { "User-Agent": USER_AGENT } });
    const $episode = cheerio.load(episodeRes.data);

    // Extract csrf_token from script
    let csrfToken = '';
    $episode('script').each((i, el) => {
      const txt = $episode(el).html();
      if (txt && txt.includes("main__obj")) {
        const match = txt.match(/main__obj\s*=\s*{[^}]*'csrf__token'\s*:\s*"([a-zA-Z0-9]+)"/);
        if (match) csrfToken = match[1];
      }
    });
    console.log(`[DEBUG] CSRF token: ${csrfToken || 'NOT FOUND'}`);

    // Extract post_id from `object__info`
    let postId = '';
    $episode('script').each((i, el) => {
      const txt = $episode(el).html();
      if (txt && txt.includes("object__info")) {
        const match = txt.match(/object__info\s*=\s*{[^}]*['"]p[s]?ot_id['"]\s*:\s*['"](\d+)['"]/);
        if (match) postId = match[1];
      }
    });
    console.log(`[DEBUG] post_id: ${postId || 'NOT FOUND'}`);

    if (!csrfToken || !postId) {
      console.log("[DEBUG] Missing CSRF token or post_id");
      return [];
    }

    // Prepare POST data
    const postData = new URLSearchParams();
    postData.append('action', 'getwatchserver');
    postData.append('postid', postId);
    postData.append('csrftoken', csrfToken);

    // AJAX request to get stream iframe
    const ajaxRes = await axios.post(`${BASE_URL}/wp-admin/admin-ajax.php`, postData.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        "Referer": episodeUrl,
        "Accept": "application/json, text/javascript, */*"
      },
      timeout: 12000
    });
    console.log(`[DEBUG] AJAX response status: ${ajaxRes.status}`);

    if (!ajaxRes.data || !ajaxRes.data.html) {
      console.log("[DEBUG] No data or html in AJAX response");
      return [];
    }

    const $ajax = cheerio.load(ajaxRes.data.html);
    const streams = [];

    $ajax('iframe').each((i, el) => {
      const src = $ajax(el).attr('src');
      if (src) {
        console.log(`[DEBUG] Found iframe src: ${src}`);
        streams.push({ name: "ArabSeed", title: `خادم ${i + 1}`, url: src });
      }
    });

    // Extended: look for video sources and script embedded URLs
    if (streams.length === 0) {
      $ajax('video source').each((i, el) => {
        const src = $ajax(el).attr('src');
        if (src) {
          console.log(`[DEBUG] Found video source: ${src}`);
          streams.push({ name: "ArabSeed", title: `خادم فيديو ${i + 1}`, url: src });
        }
      });
    }

    if (streams.length === 0) {
      $ajax('script').each((i, el) => {
        const txt = $ajax(el).html();
        const regex = /(https?:\/\/[^\s'"]+\.(m3u8|mp4))/g;
        let match;
        while ((match = regex.exec(txt))) {
          const url = match[1];
          if (url && !streams.find(s => s.url === url))
            streams.push({ name: "ArabSeed", title: `سكربت ${i + 1}`, url });
        }
      });
    }

    console.log(`[DEBUG] Total streams: ${streams.length}`);
    return streams;
  } catch (err) {
    console.error("[STREAM ERROR]", err.message);
    return [];
  }
}

module.exports = { getSeries, getSeriesMeta, getSeriesStreams };
