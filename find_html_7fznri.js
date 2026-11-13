const fs = require('fs');

const html = fs.readFileSync('nocturno_live.html', 'utf8');
const idx = html.indexOf('7fznri');
console.log(html.slice(Math.max(0, idx - 400), Math.min(html.length, idx + 600)));

