const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Raw body (for XML/HTML). Follows redirects; rejects on non-2xx final status.
 */
function httpsGetText(urlString, headers = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'Causal/1.0', Accept: '*/*', ...headers },
    };
    lib
      .get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
          return httpsGetText(next, headers, maxRedirects - 1).then(resolve).catch(reject);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${urlString}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function httpsGetJson(urlString, headers = {}, maxRedirects = 5) {
  return httpsGetText(urlString, headers, maxRedirects).then((data) => {
    try {
      return JSON.parse(data);
    } catch (e) {
      throw new Error(`JSON parse failed: ${data.substring(0, 120)}`);
    }
  });
}

module.exports = { httpsGetText, httpsGetJson };
