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

// Extract from Savefiles - Two-step extraction for dynamic loading
async function extractSavefiles(url) {
  try {
    console.log(`[DEBUG] Savefiles: Extracting from: ${url}`);
    
    // Extract file ID from URL
    const fileIdMatch = url.match(/\/e\/([a-zA-Z0-9]+)/);
    if (!fileIdMatch) {
      console.log("[DEBUG] Savefiles: Invalid URL format");
      return null;
    }
    
    const fileId = fileIdMatch[1];
    console.log(`[DEBUG] Savefiles: File ID: ${fileId}`);
    
    // Step 1: Get the embed page to extract any tokens or session data
    const embedResponse = await axios.get(url, {
      headers: { 
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://savefiles.com/",
      },
      timeout: 15000,
    });

    const embedHtml = embedResponse.data;
    console.log(`[DEBUG] Savefiles: Embed page loaded (${embedHtml.length} chars)`);

    // Step 2: Try direct download URL patterns that savefiles.com might use
    const possibleUrls = [
      `https://savefiles.com/d/${fileId}`,
      `https://savefiles.com/download/${fileId}`,
      `https://savefiles.com/file/${fileId}`,
      `https://cdn.savefiles.com/${fileId}`,
      `https://cdn.savefiles.com/file/${fileId}`,
      `https://s1.savefiles.com/${fileId}`,
      `https://s2.savefiles.com/${fileId}`,
      `https://storage.savefiles.com/${fileId}`,
    ];

    console.log(`[DEBUG] Savefiles: Trying ${possibleUrls.length} potential direct URLs`);

    // Try each URL with HEAD request to check if it exists
    for (const testUrl of possibleUrls) {
      try {
        console.log(`[DEBUG] Savefiles: Testing URL: ${testUrl}`);
        
        const headResponse = await axios.head(testUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Referer": url,
          },
          timeout: 5000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500, // Accept redirects
        });

        console.log(`[DEBUG] Savefiles: HEAD response: ${headResponse.status} for ${testUrl}`);
        console.log(`[DEBUG] Savefiles: Content-Type: ${headResponse.headers['content-type']}`);
        
        // Check if it's a video file
        const contentType = headResponse.headers['content-type'] || '';
        if (contentType.includes('video') || contentType.includes('octet-stream') || 
            contentType.includes('mp4') || headResponse.status === 200) {
          
          console.log(`[DEBUG] Savefiles: ✓ Found valid video URL: ${testUrl}`);
          return {
            url: testUrl,
            behaviorHints: {
              notWebReady: false,
              bingeGroup: "savefiles",
            },
          };
        }
      } catch (headError) {
        console.log(`[DEBUG] Savefiles: URL test failed: ${testUrl} - ${headError.message}`);
      }
    }

    // Step 3: Look for API endpoint in the embed page JavaScript
    const apiPatterns = [
      /api["\s:]+["']([^"']+)["']/i,
      /endpoint["\s:]+["']([^"']+)["']/i,
      /getFile["\s(]+["']([^"']+)["']/i,
      /download["\s:]+["']([^"']+)["']/i,
    ];

    for (const pattern of apiPatterns) {
      const match = embedHtml.match(pattern);
      if (match && match[1]) {
        let apiUrl = match[1];
        
        // Construct full API URL
        if (apiUrl.startsWith("/")) {
          apiUrl = "https://savefiles.com" + apiUrl;
        }
        
        // Add file ID to API URL
        if (!apiUrl.includes(fileId)) {
          apiUrl = `${apiUrl}/${fileId}`;
        }
        
        console.log(`[DEBUG] Savefiles: Found potential API URL: ${apiUrl}`);
        
        try {
          const apiResponse = await axios.get(apiUrl, {
            headers: {
              "User-Agent": USER_AGENT,
              "Referer": url,
            },
            timeout: 10000,
          });
          
          // Try to extract video URL from API response
          const apiData = typeof apiResponse.data === 'string' 
            ? apiResponse.data 
            : JSON.stringify(apiResponse.data);
          
          const urlMatch = apiData.match(/https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/i);
          if (urlMatch) {
            console.log(`[DEBUG] Savefiles: ✓ Video URL from API: ${urlMatch[0]}`);
            return {
              url: urlMatch[0],
              behaviorHints: {
                notWebReady: false,
                bingeGroup: "savefiles",
              },
            };
          }
        } catch (apiError) {
          console.log(`[DEBUG] Savefiles: API request failed: ${apiError.message}`);
        }
      }
    }

    // Step 4: Last resort - return the embed URL itself for external player handling
    console.log(`[DEBUG] Savefiles: Could not extract direct URL, returning embed URL`);
    
    // Return the embed URL with a flag that it needs external handling
    return {
      url: url, // Return original embed URL
      externalUrl: url, // Mark for external player
      behaviorHints: {
        notWebReady: true,
        bingeGroup: "savefiles",
      },
      note: "Direct extraction failed - requires browser playback"
    };

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
