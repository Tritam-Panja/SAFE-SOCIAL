const fs = require('fs');

const html = fs.readFileSync('nocturno_live.html', 'utf8');

// Find project links and their images
const projectRegex = /href=["']\.\/projects\/([^"']+)["'][\s\S]*?<\/a>/g;
let m;
while ((m = projectRegex.exec(html)) !== null) {
  const slug = m[1];
  const block = m[0];
  const imgMatch = block.match(/https:\/\/framerusercontent\.com\/images\/[^"'\s]+/);
  const titleMatch = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/);
  console.log('Project:', slug);
  console.log('  Image:', imgMatch ? imgMatch[0] : 'none');
  console.log('  Title:', titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '') : 'none');
}

