const express = require('express');
const request = require('request');
const app = express();

const PORT = process.env.PORT || 3000;

// Simple proxy endpoint
app.get('/proxy', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Missing URL parameter');
  }

  // Here you could add whitelist checks to avoid abuse

  // Pipe the request to the target URL
  request(targetUrl).pipe(res);
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
