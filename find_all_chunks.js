const fs = require('fs');

const html = fs.readFileSync('nocturno_live.html', 'utf8');
const chunks = html.match(/https:\/\/framerusercontent\.com\/sites\/6Oi19eZemJk7lS3AKXe09V\/[^"'\s]+/g) || [];
console.log('All framer site scripts:', [...new Set(chunks)]);

