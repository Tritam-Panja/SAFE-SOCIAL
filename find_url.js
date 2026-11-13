const https = require('https');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  const html = await fetchPage('https://www.framer.com/marketplace/templates/nocturno/');
  console.log('HTML length:', html.length);
  // find script tags or json
  const scripts = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (scripts) {
    console.log('Next data found');
    const data = JSON.parse(scripts[1]);
    console.log('Next data keys:', Object.keys(data));
    console.log(JSON.stringify(data.props?.pageProps, null, 2).slice(0, 2000));
  } else {
    // search for any URL in the page
    const urls = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
    console.log('URLs found:', urls.filter(u => u.includes('nocturno') || u.includes('preview') || u.includes('demo') || u.includes('framer')));
  }
}

run();
