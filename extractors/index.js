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
// Extract from Savefiles - Enhanced for Vercel serverless
// Extract from Savefiles - Enhanced with detailed debugging
async function extractSavefiles(url) {
  try {
    console.log(`[DEBUG] Savefiles: Extracting from: ${url}`);
    
    // Extract file ID from URL
    const fileId = url.match(/\/e\/([a-zA-Z0-9]+)/)?.[1];
    
    if (!fileId) {
      console.log("[DEBUG] Savefiles: Invalid URL format");
      return null;
    }
    
    console.log(`[DEBUG] Savefiles: File ID: ${fileId}`);
    
    const response = await axios.get(url, {
      headers: { 
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Cache-Control": "max-age=0",
        Referer: "https://savefiles.com/",
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const html = response.data;
    console.log(`[DEBUG] Savefiles: HTML length: ${html.length}`);
    console.log(`[DEBUG] Savefiles: Response status: ${response.status}`);
    
    // Debug: Check if HTML contains video-related keywords
    const hasVideo = html.toLowerCase().includes('video');
    const hasSource = html.toLowerCase().includes('source');
    const hasMp4 = html.toLowerCase().includes('.mp4');
    const hasM3u8 = html.toLowerCase().includes('.m3u8');
    
    console.log(`[DEBUG] Savefiles: Contains 'video': ${hasVideo}`);
    console.log(`[DEBUG] Savefiles: Contains 'source': ${hasSource}`);
    console.log(`[DEBUG] Savefiles: Contains '.mp4': ${hasMp4}`);
    console.log(`[DEBUG] Savefiles: Contains '.m3u8': ${hasM3u8}`);

    const $ = cheerio.load(html);

    // Method 1: Check direct video/source tags in HTML
    let sourceUrl = $("video source").attr("src") || 
                    $("source").attr("src") || 
                    $("video").attr("src");

    if (sourceUrl) {
      console.log(`[DEBUG] Savefiles: Raw source URL: ${sourceUrl}`);
      
      // Handle relative URLs
      if (sourceUrl.startsWith("//")) {
        sourceUrl = "https:" + sourceUrl;
      } else if (sourceUrl.startsWith("/")) {
        sourceUrl = "https://savefiles.com" + sourceUrl;
      } else if (!sourceUrl.startsWith("http")) {
        sourceUrl = "https://" + sourceUrl;
      }
      
      console.log(`[DEBUG] Savefiles: ✓ Source URL found from HTML tags: ${sourceUrl}`);
      return {
        url: sourceUrl,
        behaviorHints: {
          notWebReady: false,
          bingeGroup: "savefiles",
        },
      };
    }

    // Method 2: Look in script tags specifically
    const scripts = $("script").toArray();
    console.log(`[DEBUG] Savefiles: Found ${scripts.length} script tags`);
    
    for (let i = 0; i < scripts.length; i++) {
      const scriptContent = $(scripts[i]).html() || "";
      
      // Log script content if it contains relevant keywords
      if (scriptContent.includes("mp4") || scriptContent.includes("m3u8") || 
          scriptContent.includes("video") || scriptContent.includes("source")) {
        console.log(`[DEBUG] Savefiles: Script ${i} contains video keywords (length: ${scriptContent.length})`);
        
        // Try to extract video URL from this script
        const patterns = [
          /file["\s:]+["']([^"']+\.mp4[^"']*)["']/i,
          /source["\s:]+["']([^"']+\.mp4[^"']*)["']/i,
          /url["\s:]+["']([^"']+\.mp4[^"']*)["']/i,
          /video["\s:]+["']([^"']+\.mp4[^"']*)["']/i,
          /"(https?:\/\/[^"]+\.mp4[^"]*)"/i,
          /'(https?:\/\/[^']+\.mp4[^']*)'/i,
          /src["\s:=]+["']([^"']+\.mp4[^"']*)["']/i,
        ];
        
        for (const pattern of patterns) {
          const match = scriptContent.match(pattern);
          if (match && match[1]) {
            let videoUrl = match[1];
            console.log(`[DEBUG] Savefiles: Found potential URL in script: ${videoUrl}`);
            
            // Handle relative URLs
            if (videoUrl.startsWith("//")) {
              videoUrl = "https:" + videoUrl;
            } else if (videoUrl.startsWith("/")) {
              videoUrl = "https://savefiles.com" + videoUrl;
            }
            
            console.log(`[DEBUG] Savefiles: ✓ Video URL extracted from script`);
            return {
              url: videoUrl,
              behaviorHints: {
                notWebReady: false,
                bingeGroup: "savefiles",
              },
            };
          }
        }
      }
    }

    // Method 3: Enhanced pattern matching on entire HTML
    const patterns = [
      // Most specific patterns first
      /<video[^>]+src=["']([^"']+)["']/i,
      /<source[^>]+src=["']([^"']+)["']/i,
      /file:\s*["']([^"']+\.mp4[^"']*)["']/i,
      /sources?:\s*\[?\s*{[^}]*file:\s*["']([^"']+\.mp4[^"']*)["']/i,
      /"video_url":\s*"([^"]+)"/i,
      /'video_url':\s*'([^']+)'/i,
      /data-src=["']([^"']+\.mp4[^"']*)["']/i,
      /\bhref=["']([^"']+\.mp4[^"']*)["']/i,
    ];

    console.log(`[DEBUG] Savefiles: Trying ${patterns.length} patterns on full HTML`);
    
    for (let i = 0; i < patterns.length; i++) {
      const match = html.match(patterns[i]);
      if (match && match[1]) {
        let videoUrl = match[1];
        console.log(`[DEBUG] Savefiles: Pattern ${i} matched: ${videoUrl}`);
        
        // Handle relative URLs
        if (videoUrl.startsWith("//")) {
          videoUrl = "https:" + videoUrl;
        } else if (videoUrl.startsWith("/")) {
          videoUrl = "https://savefiles.com" + videoUrl;
        }
        
        console.log(`[DEBUG] Savefiles: ✓ Video URL found via pattern ${i}`);
        return {
          url: videoUrl,
          behaviorHints: {
            notWebReady: videoUrl.includes(".m3u8"),
            bingeGroup: "savefiles",
          },
        };
      }
    }

    // Method 4: Scan for ALL mp4 URLs
    const mp4Regex = /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi;
    const allMp4Links = html.match(mp4Regex);
    
    if (allMp4Links && allMp4Links.length > 0) {
      console.log(`[DEBUG] Savefiles: Found ${allMp4Links.length} mp4 URLs`);
      allMp4Links.forEach((link, i) => {
        console.log(`[DEBUG] Savefiles: MP4 ${i}: ${link}`);
      });
      
      const validLinks = allMp4Links.filter(link => 
        !link.toLowerCase().includes("thumb") && 
        !link.toLowerCase().includes("preview") &&
        !link.toLowerCase().includes("sprite")
      );
      
      if (validLinks.length > 0) {
        console.log(`[DEBUG] Savefiles: ✓ Using first valid mp4 URL: ${validLinks[0]}`);
        return {
          url: validLinks[0],
          behaviorHints: {
            notWebReady: false,
            bingeGroup: "savefiles",
          },
        };
      }
    }

    // Method 5: Check for iframe or embed that might contain the actual player
    const iframe = $("iframe").attr("src");
    if (iframe) {
      console.log(`[DEBUG] Savefiles: Found iframe: ${iframe}`);
      // Recursively extract from iframe
      if (iframe.startsWith("http")) {
        console.log(`[DEBUG] Savefiles: Attempting to extract from iframe`);
        return await extractSavefiles(iframe);
      }
    }

    // Debug: Save first 1000 chars of HTML for manual inspection
    console.log(`[DEBUG] Savefiles: HTML preview (first 1000 chars):`);
    console.log(html.substring(0, 1000));

    console.log(`[DEBUG] Savefiles: ✗ No video URL found after all methods`);
    return null;
    
  } catch (error) {
    console.error(`[ERROR] Savefiles extraction failed:`, error.message);
    console.error(`[ERROR] Stack:`, error.stack);
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
