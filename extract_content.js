const fs = require('fs');
const html = fs.readFileSync('nocturno_live.html', 'utf8');

// Find all text nodes between tags
const matches = [];
const tagRe = />([^<]+)</g;
let m;
while ((m = tagRe.exec(html)) !== null) {
  const text = m[1].trim();
  if (text.length > 0 && !text.startsWith('{') && !text.includes('function(') && !text.includes('var ')) {
    matches.push(text);
  }
}

console.log('Total extracted texts:', matches.length);
fs.writeFileSync('extracted_texts.txt', matches.join('\n'));
console.log('Sample texts:\n' + matches.slice(0, 60).join('\n'));

