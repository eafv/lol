const express = require('express');
const request = require('request');
const { JSDOM } = require('jsdom');
const URL = require('url').URL;

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend
app.use(express.static('public'));

// Helper: rewrite links in HTML to point back to our proxy
function rewriteHTML(body, baseUrl) {
  const dom = new JSDOM(body);
  const document = dom.window.document;

  // Rewrite all links
  [...document.querySelectorAll('a[href]')].forEach(a => {
    let href = a.getAttribute('href');
    if (!href) return;

    // Ignore javascript: or mailto:
    if (href.startsWith('javascript:') || href.startsWith('mailto:')) return;

    // Convert relative URLs to absolute
    try {
      const absolute = new URL(href, baseUrl).href;
      a.setAttribute('href', '/proxy?url=' + encodeURIComponent(absolute));
    } catch (e) {
      // ignore broken URLs
    }
  });

  // Rewrite img, script, link(css) URLs similarly
  [...document.querySelectorAll('img[src], script[src], link[href]')].forEach(el => {
    let attr = el.tagName === 'LINK' ? 'href' : 'src';
    let val = el.getAttribute(attr);
    if (!val) return;

    try {
      const absolute = new URL(val, baseUrl).href;
      el.setAttribute(attr, '/proxy?url=' + encodeURIComponent(absolute));
    } catch (e) {}
  });

  // Optional: rewrite forms to post back to proxy
  [...document.querySelectorAll('form[action]')].forEach(form => {
    let action = form.getAttribute('action');
    try {
      const absolute = new URL(action, baseUrl).href;
      form.setAttribute('action', '/proxy?url=' + encodeURIComponent(absolute));
    } catch (e) {}
  });

  return dom.serialize();
}

app.get('/proxy', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing URL');

  // Validate url
  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  // Fetch requested URL with a real browser user agent
  request(
    {
      url: targetUrl.href,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      encoding: null, // to get body as Buffer
    },
    (error, response, body) => {
      if (error || !response) {
        return res.status(500).send('Error fetching the URL');
      }

      // Pass through headers (except some restricted ones)
      Object.entries(response.headers).forEach(([key, value]) => {
        if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
          return;
        }
        res.setHeader(key, value);
      });

      const contentType = response.headers['content-type'] || '';

      if (contentType.includes('text/html')) {
        // Rewrite HTML content
        const bodyStr = body.toString('utf8');
        const rewritten = rewriteHTML(bodyStr, targetUrl.href);
        res.send(rewritten);
      } else {
        // Send non-HTML content raw
        res.send(body);
      }
    }
  );
});

// Root serves the frontend
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
