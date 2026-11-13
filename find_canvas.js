const fs = require('fs');
const html = fs.readFileSync('nocturno_live.html', 'utf8');

// Find occurrences of <canvas> with surrounding 300 chars
let pos = 0;
while (true) {
  const idx = html.indexOf('<canvas', pos);
  if (idx === -1) break;
  console.log('--- CANVAS FOUND at', idx, '---');
  console.log(html.slice(Math.max(0, idx - 150), Math.min(html.length, idx + 250)));
  pos = idx + 7;
}

