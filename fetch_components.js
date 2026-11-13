const https = require('https');
const fs = require('fs');

const base = 'https://framerusercontent.com/sites/6Oi19eZemJk7lS3AKXe09V/';
const files = [
  'LiquidImage.mylaXKmg.mjs',
  'LYa0Ji66l.Dqosg8iI.mjs',
  'mRSNlGUXh.Dy2zCNFf.mjs',
  'YEr50jhNv.CGmP_oDy.mjs',
  'augiA20Il.bjk4iuTq.mjs'
];

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
  for (const f of files) {
    const content = await download(base + f);
    fs.writeFileSync(f.split('.')[0] + '.js', content);
    console.log(`Saved ${f}, size: ${content.length}`);
  }
}

run();

