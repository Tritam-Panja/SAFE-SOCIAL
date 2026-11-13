const https = require('https');
const fs = require('fs');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function scrapeNocturno() {
  const html = await fetchPage('https://nocturnoo.framer.website/');
  fs.writeFileSync('nocturno_live.html', html);
  console.log('Saved nocturno_live.html, size:', html.length);

  // Extract fonts, stylesheets, images, scripts
  const css = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)].map(m => m[1]);
  console.log('Stylesheets:', css);

  // Extract font families or google fonts
  const fonts = [...html.matchAll(/https:\/\/fonts\.[^"'\s]+/g)].map(m => m[0]);
  console.log('Fonts:', fonts);

  // Extract images
  const images = [...html.matchAll(/https:\/\/framerusercontent\.com\/images\/[^"'\s]+/g)].map(m => m[0]);
  console.log('Images count:', images.length);
  console.log('Sample images:', images.slice(0, 10));

  // Extract all text content headlines
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  console.log('Headings:', headings);
}

scrapeNocturno().catch(console.error);

