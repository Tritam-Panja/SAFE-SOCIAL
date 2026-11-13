const fs = require('fs');

const bundle = fs.readFileSync('homepage_bundle.js', 'utf8');

// Search for hero sculpture or 3D element in the hero
const idx = bundle.indexOf('Hero Sculpture');
if (idx !== -1) {
  console.log('Hero Sculpture found:');
  console.log(bundle.slice(Math.max(0, idx - 400), Math.min(bundle.length, idx + 800)));
} else {
  console.log('Hero sculpture text not found in homepage bundle, checking HTML');
  const html = fs.readFileSync('nocturno_live.html', 'utf8');
  const hIdx = html.indexOf('Hero Sculpture');
  if (hIdx !== -1) {
    console.log(html.slice(Math.max(0, hIdx - 300), Math.min(html.length, hIdx + 500)));
  }
}

