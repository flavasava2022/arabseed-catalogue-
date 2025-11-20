// extractors/index.js
const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://a.asd.homes";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Extract from Arabseed server using reviewrate.net embed
async function extractArabseedServer(embedCode) {
  try {
    console.log(`[DEBUG] ArabseedServer: Original URL: ${embedCode}`);

    const playerResponse = await axios.get(embedCode, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: BASE_URL,
      },
      timeout: 10000,
    });

    const $player = cheerio.load(playerResponse.data);
    const videoSrc =
      $player("video source").attr("src") || $player("source").attr("src");

    if (videoSrc) {
      console.log(`[DEBUG] ArabseedServer: ✓ Video URL found: ${videoSrc}`);

      // Use proxy URL with encoded video URL
      const proxyUrl = `https://arabseed-catalogue.vercel.app/proxy/arabseed?url=${encodeURIComponent(
        videoSrc
      )}`;
      console.log(`[DEBUG] ArabseedServer: Using proxy URL`);

      return {
        url: proxyUrl,
        behaviorHints: {
          notWebReady: false,
          bingeGroup: "arabseed-server",
        },
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
    const encodedId = urlObj.searchParams.get("id");

    if (!encodedId) {
      console.log("[DEBUG] ArabseedProxy: No id parameter found");
      return null;
    }

    const decodedUrl = Buffer.from(encodedId, "base64").toString();
    console.log(`[DEBUG] ArabseedProxy: Decoded URL: ${decodedUrl}`);

    if (decodedUrl.includes("savefiles")) {
      return await extractSavefiles(decodedUrl);
    } else if (decodedUrl.includes("voe.sx")) {
      return await extractVoe(decodedUrl);
    } else if (decodedUrl.includes("filemoon")) {
      return await extractFilemoon(decodedUrl);
    } else if (decodedUrl.includes("vidmoly")) {
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
      /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        console.log(`[DEBUG] Vidmoly: ✓ Video URL found`);
        return {
          url: match[1],
          behaviorHints: {
            notWebReady: true,
            bingeGroup: "vidmoly",
          },
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

    let sourceUrl =
      $('source[type="application/vnd.apple.mpegurl"]').attr("src") ||
      $('source[type="application/x-mpegURL"]').attr("src") ||
      $("source").attr("src");

    if (sourceUrl) {
      sourceUrl = sourceUrl.startsWith("http")
        ? sourceUrl
        : `https:${sourceUrl}`;
      console.log(`[DEBUG] Filemoon: ✓ Source URL found from HTML`);
      return {
        url: sourceUrl,
        behaviorHints: {
          notWebReady: true,
          bingeGroup: "filemoon",
        },
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
        const finalUrl = match[1].startsWith("http")
          ? match[1]
          : `https:${match[1]}`;
        return {
          url: finalUrl,
          behaviorHints: {
            notWebReady: true,
            bingeGroup: "filemoon",
          },
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
            bingeGroup: "voe",
          },
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
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }
    
    try {
        // Extract file ID
        const fileId = url.match(/\/e\/([a-zA-Z0-9]+)/)?.[1];
        
        if (!fileId) {
            return res.status(400).json({ error: 'Invalid savefiles.com URL' });
        }
        
        // Fetch the embed page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const html = await response.text();
        
        // Try multiple extraction patterns
        const patterns = [
            // Pattern 1: Direct video tag
            /<video[^>]+src=["']([^"']+)["']/i,
            /<source[^>]+src=["']([^"']+)["']/i,
            
            // Pattern 2: JavaScript file variable
            /file:\s*["']([^"']+\.mp4[^"']*)["']/i,
            /sources?:\s*\[?\s*{[^}]*file:\s*["']([^"']+)["']/i,
            
            // Pattern 3: Video URL in any format
            /video_url["']?\s*[:=]\s*["']([^"']+)["']/i,
            /mp4["']?\s*[:=]\s*["']([^"']+)["']/i,
            
            // Pattern 4: Direct CDN links
            /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/i,
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                let videoUrl = match[1];
                
                // Handle relative URLs
                if (videoUrl.startsWith('//')) {
                    videoUrl = 'https:' + videoUrl;
                } else if (videoUrl.startsWith('/')) {
                    videoUrl = 'https://savefiles.com' + videoUrl;
                }
                
                return res.status(200).json({
                    success: true,
                    videoUrl: videoUrl,
                    method: 'pattern_match'
                });
            }
        }
        
        // If no direct match, try to find any .mp4 URL in scripts
        const allMp4Links = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi);
        
        if (allMp4Links && allMp4Links.length > 0) {
            return res.status(200).json({
                success: true,
                videoUrl: allMp4Links[0],
                allUrls: allMp4Links,
                method: 'mp4_scan'
            });
        }
        
        return res.status(404).json({
            success: false,
            error: 'No video URL found',
            fileId: fileId
        });
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
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

    let sourceUrl = $("video source").attr("src") || $("source").attr("src");

    if (sourceUrl) {
      sourceUrl = sourceUrl.startsWith("http")
        ? sourceUrl
        : `https:${sourceUrl}`;
      console.log(`[DEBUG] Generic: ✓ Source URL found`);
      return {
        url: sourceUrl,
        behaviorHints: {
          notWebReady: true,
        },
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
            notWebReady: true,
          },
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
    if (driver === "arabseed") {
      result = await extractArabseedServer(embedUrl);
    } else if (driver === "arabseed-proxy") {
      result = await extractArabseedProxy(embedUrl);
    } else if (driver === "vidmoly") {
      result = await extractVidmoly(embedUrl);
    } else if (driver === "filemoon") {
      result = await extractFilemoon(embedUrl);
    } else if (driver === "voe") {
      result = await extractVoe(embedUrl);
    } else if (driver === "savefiles") {
      result = await extractSavefiles(embedUrl);
    } else if (driver === "generic") {
      result = await extractGeneric(embedUrl);
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
    console.error(
      `[ERROR] extractVideoUrl failed for ${driver}:`,
      error.message
    );
    return null;
  }
}

module.exports = {
  extractVideoUrl,
  extractArabseedServer,
  extractArabseedProxy,
  extractVidmoly,
  extractFilemoon,
  extractVoe,
  extractSavefiles,
  extractGeneric,
};
