const https = require('https');
const fs = require('fs');

const scriptUrl = 'https://framerusercontent.com/sites/6Oi19eZemJk7lS3AKXe09V/script_main.B3jECEnT.mjs';

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
  const code = await download(scriptUrl);
  fs.writeFileSync('script_main.js', code);
  console.log('Saved script_main.js, length:', code.length);

  // Search for imported modules in script_main
  const imports = [...code.matchAll(/from\s*["']([^"']+)["']/g)].map(m => m[1]);
  console.log('Imports:', imports);
}

run();

