// api/index.js
const querystring = require('querystring');
const axios = require('axios');
const { manifest, catalogHandler, metaHandler, streamHandler } = require('../addon');

export default async function handler(req, res) {
  const url = req.url;

  // Set CORS headers for web compatibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Manifest route
    if (url === '/' || url === '/manifest.json') {
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json(manifest);
    }

    // Proxy route for ArabSeed videos
    if (url.startsWith('/proxy/arabseed')) {
      return handleArabseedProxy(req, res);
    }

    // Catalog route
    const catalogMatch = url.match(/^\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json$/);
    if (catalogMatch) {
      res.setHeader('Content-Type', 'application/json');
      const [, type, id, extraStr] = catalogMatch;
      const extra = extraStr ? querystring.parse(extraStr) : {};
      const result = await catalogHandler({ type, id, extra });
      return res.status(200).json(result);
    }

    // Stream route
    const streamMatch = url.match(/^\/stream\/([^/]+)\/(.+)\.json$/);
    if (streamMatch) {
      res.setHeader('Content-Type', 'application/json');
      const [, type, id] = streamMatch;
      const result = await streamHandler({ type, id: decodeURIComponent(id) });
      return res.status(200).json(result);
    }

    // Meta route
    const metaMatch = url.match(/^\/meta\/([^/]+)\/(.+)\.json$/);
    if (metaMatch) {
      res.setHeader('Content-Type', 'application/json');
      const [, type, id] = metaMatch;
      const result = await metaHandler({ type, id: decodeURIComponent(id) });
      return res.status(200).json(result);
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Proxy handler for ArabSeed videos with referrer header
async function handleArabseedProxy(req, res) {
  try {
    const urlParams = new URL(req.url, `https://${req.headers.host}`);
    const videoUrl = urlParams.searchParams.get('url');

    if (!videoUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    console.log(`[PROXY] Fetching video from: ${videoUrl}`);

    // Fetch video with proper referrer header
    const response = await axios({
      method: 'GET',
      url: videoUrl,
      headers: {
        'Referer': 'https://m.arabseed.show/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Range': req.headers.range || 'bytes=0-'
      },
      responseType: 'stream',
      validateStatus: (status) => status < 500,
      maxRedirects: 5
    });

    // Forward status and headers to client
    res.status(response.status);
    
    // Forward important headers
    const headersToForward = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
      'last-modified'
    ];

    headersToForward.forEach(header => {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    });

    // Allow CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');

    // Stream the video to client
    response.data.pipe(res);

  } catch (error) {
    console.error('[PROXY ERROR]', error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Proxy request failed',
        status: error.response.status
      });
    }
    
    return res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message 
    });
  }
}
