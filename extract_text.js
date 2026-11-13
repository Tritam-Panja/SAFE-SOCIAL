const fs = require('fs');

const html = fs.readFileSync('nocturno_live.html', 'utf8');

// Let's inspect the entire DOM text structure
// We can strip scripts and styles and print out readable text hierarchy
const clean = html
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '[SVG]');

fs.writeFileSync('cleaned_dom.html', clean);

// Let's also extract all text blocks and classes/styles
console.log('Cleaned file written. Total lines:', clean.split('\n').length);

