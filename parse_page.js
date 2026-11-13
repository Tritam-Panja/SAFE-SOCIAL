const fs = require('fs');
const html = fs.readFileSync('nocturno_live.html', 'utf8');

// strip style and script tags completely
let noScripts = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

const regex = />([^<]+)</g;
let m;
const lines = [];
while ((m = regex.exec(noScripts)) !== null) {
  const t = m[1].replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
  if (t) lines.push(t);
}

// deduplicate consecutive identical items
const deduped = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i] !== lines[i-1]) {
    deduped.push(lines[i]);
  }
}

fs.writeFileSync('all_page_content.txt', deduped.join('\n'));
console.log('Saved all_page_content.txt, total distinct lines:', deduped.length);
console.log(deduped.slice(0, 100).join('\n'));

