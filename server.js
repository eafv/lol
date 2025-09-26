const express = require('express');
const request = require('request');
const { JSDOM } = require('jsdom');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

function rewriteHtml(body, baseUrl) {
  const dom = new JSDOM(body);
  const document = dom.window.document;

  // Rewrite all links (<a href>) to proxy through us
  [...document.querySelectorAll('a[href]')].forEach(a => {
    let href = a.getAttribute('href');
    if (!href) return;

    if (href.startsWith('http')) {
      a.setAttribute('href', `/proxy?url=${encodeURIComponent(href)}`);
    } else if (href.startsWith('/')) {
      // absolute path: prepend base url origin
      try {
        const origin = new URL(baseUrl).origin;
        a.setAttribute('href', `/proxy?url=${encodeURIComponent(origin + href)}`);
      } catch {
        a.setAttribute('href', '#');
      }
    } else {
      // relative path: resolve relative to baseUrl
      try {
        const resolved = new URL(href, baseUrl).href;
        a.setAttribute('href', `/proxy?url=${encodeURIComponent(resolved)}`);
      } catch {
        a.setAttribute('href', '#');
      }
    }
  });

  // Rewrite images, scripts, css to go through proxy as well (optional)
  // To keep it simple, just rewrite images src
  [...document.querySelectorAll('img[src]')].forEach(img => {
    let src = img.getAttribute('src');
    if (!src) return;

    if (src.startsWith('http')) {
      img.setAttribute('src', `/proxy?url=${encodeURIComponent(src)}`);
    } else if (src.startsWith('/')) {
      try {
        const origin = new URL(baseUrl).origin;
        img.setAttribute('src', `/proxy?url=${encodeURIComponent(origin + src)}`);
      } catch {
        img.setAttribute('src', '');
      }
    } else {
      try {
        const resolved = new URL(src, baseUrl).href;
        img.setAttribute('src', `/proxy?url=${encodeURIComponent(resolved)}`);
      } catch {
        img.setAttribute('src', '');
      }
    }
  });

  return dom.serialize();
}

app.get('/proxy', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url parameter');

  // Basic whitelist example - remove or add your own allowed sites for safety
  const allowedHosts = ['www.tiktok.com', 'www.instagram.com', 'twitter.com', 'example.com'];
  try {
    const host = new URL(url).hostname;
    if (!allowedHosts.some(h => host.includes(h))) {
      return res.status(403).send('Host not allowed.');
    }
  } catch {
    return res.status(400).send('Invalid URL');
  }

  // Fetch the content
  request({ url, headers: { 'User-Agent': 'Mozilla/5.0' } }, (error, response, body) => {
    if (error || response.statusCode !== 200) {
      return res.status(500).send('Failed to fetch the requested page.');
    }

    // Only rewrite for HTML content types
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      const rewritten = rewriteHtml(body, url);
      res.send(rewritten);
    } else {
      // For images, css, js etc. just pipe directly
      res.setHeader('content-type', contentType);
      res.send(body);
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
