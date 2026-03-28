import { setResponseHeaders } from 'h3';
import { getCachedSegment } from './m3u8-proxy';

// Check if caching is enabled via environment variable (disabled by default)
const isCacheDisabled = () => process.env.ENABLE_CACHE !== 'true';

export default defineEventHandler(async (event) => {
  // Handle CORS preflight requests
  if (isPreflightRequest(event)) return handleCors(event, {});

  if (process.env.DISABLE_M3U8 === 'true') {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*'
    });

    throw createError({
      statusCode: 404,
      statusMessage: error.message || 'TS proxying is disabled'
    });
  }
  
  const url = getQuery(event).url as string;
  const headersParam = getQuery(event).headers as string;
  
  if (!url) {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*'
    });

    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'URL parameter is required'
    });
  }
  
  let headers = {};
  try {
    headers = headersParam ? JSON.parse(headersParam) : {};
  } catch (e) {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*'
    });

    throw createError({
      statusCode: 400,
      statusMessage: error.message || 'Invalid headers format'
    });
  }
  
  try {
    // Only check cache if caching is enabled
    if (!isCacheDisabled()) {
      const cachedSegment = getCachedSegment(url);
      
      if (cachedSegment) {
        setResponseHeaders(event, {
          'Content-Type': cachedSegment.headers['content-type'] || 'video/mp2t',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
          'Cache-Control': 'public, max-age=3600' // Allow caching of TS segments
        });
        
        return cachedSegment.data;
      }
    }
    
    const response = await globalThis.fetch(url, {
      method: 'GET',
      headers: {
        // Default User-Agent (from src/utils/headers.ts)
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0',
        ...(headers as HeadersInit),
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch TS file: ${response.status} ${response.statusText}`);
    }
    
    setResponseHeaders(event, {
      'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
      'Cache-Control': 'public, max-age=3600' // Allow caching of TS segments
    });
    
    // Return the binary data directly
    return new Uint8Array(await response.arrayBuffer());
  } catch (error: any) {
    console.error('Error proxying TS file:', error);
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*'
    });

    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Error proxying TS file'
    });
    //return sendError(event, createError({
      //statusCode: error.response?.status || 500,
      //statusMessage: error.message || 'Error proxying TS file'
    //}));
  }
});
