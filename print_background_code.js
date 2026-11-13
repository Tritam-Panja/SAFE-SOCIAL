const fs = require('fs');

const code = fs.readFileSync('toplevel-deps.js', 'utf8');

const idx = code.indexOf('Interactive Background');
console.log('Idx:', idx);
if (idx !== -1) {
  console.log(code.slice(Math.max(0, idx - 1500), Math.min(code.length, idx + 4000)));
}

