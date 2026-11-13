const fs = require('fs');

const html = fs.readFileSync('nocturno_live.html', 'utf8');

// Let's find script bundles that contain the Framer component code or data
const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
console.log('Script count:', scripts.length);
scripts.forEach(s => console.log(s));

// Look for inline scripts or JSON data
const inlineScripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('Inline script count:', inlineScripts.length);
inlineScripts.forEach((s, i) => {
  if (s.length > 100) {
    console.log(`Inline script #${i} length: ${s.length}, snippet: ${s.slice(0, 300)}...`);
  }
});

