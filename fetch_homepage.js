const https = require('https');
const fs = require('fs');

const base = 'https://framerusercontent.com/sites/6Oi19eZemJk7lS3AKXe09V/';
const homePageBundle = '1RuS9K7bKK8IFWuMo1XjDHFQMdCwHz-mKh883E3iYYc.BXQ18Odn.mjs';

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  const code = await download(base + homePageBundle);
  fs.writeFileSync('homepage_bundle.js', code);
  console.log('Homepage bundle saved, size:', code.length);

  // Search for component imports or canvas / three / shaders
  const imports = [...code.matchAll(/from\s*["']([^"']+)["']/g)].map(m => m[1]);
  console.log('Homepage imports count:', imports.length);
  imports.forEach(i => console.log(i));
}

run();

