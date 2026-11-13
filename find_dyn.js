const fs = require('fs');
const hp = fs.readFileSync('homepage_bundle.js', 'utf8');

const matches = [...hp.matchAll(/import\(['"]\.\/([^'"]+)['"]\)/g)].map(m => m[1]);
console.log('Dynamic imports in homepage:', matches);

// Also let's inspect augiA20Il.js and mRSNlGUXh.js
console.log('mRSNlGUXh:', fs.readFileSync('mRSNlGUXh.js', 'utf8').slice(0, 500));
console.log('YEr50jhNv:', fs.readFileSync('YEr50jhNv.js', 'utf8').slice(0, 500));
console.log('augiA20Il:', fs.readFileSync('augiA20Il.js', 'utf8').slice(0, 500));

