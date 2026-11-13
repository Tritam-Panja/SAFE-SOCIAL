const fs = require('fs');

const bundle = fs.readFileSync('homepage_bundle.js', 'utf8');
const idx = bundle.indexOf('7fznri');
if (idx !== -1) {
  console.log('Found 7fznri at', idx);
  console.log(bundle.slice(Math.max(0, idx - 300), Math.min(bundle.length, idx + 800)));
} else {
  console.log('7fznri not found in homepage bundle');
}

// Search for toplevel-deps
console.log('toplevel-deps:', fs.existsSync('toplevel-deps.dOADCMvQ.mjs'));

