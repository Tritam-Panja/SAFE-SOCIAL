const fs = require('fs');

const bundle = fs.readFileSync('homepage_bundle.js', 'utf8');

// Find all occurrences of canvas in homepage_bundle
let pos = 0;
while (true) {
  const idx = bundle.indexOf('canvas', pos);
  if (idx === -1) break;
  console.log('--- match at', idx, '---');
  console.log(bundle.slice(Math.max(0, idx - 100), Math.min(bundle.length, idx + 200)));
  pos = idx + 6;
  if (pos > 20000) break;
}

// Also check for shader code or particle code
const glMatch = bundle.match(/createShader|compileShader|getContext\(['"]webgl/g);
console.log('GL matches in homepage bundle:', glMatch);

