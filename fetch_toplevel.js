const https = require('https');
const fs = require('fs');

const url = 'https://framerusercontent.com/sites/6Oi19eZemJk7lS3AKXe09V/toplevel-deps.dOADCMvQ.mjs';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('toplevel-deps.js', data);
    console.log('Saved toplevel-deps.js, size:', data.length);
    // Find canvas or shaders
    console.log('Includes canvas:', data.includes('canvas'));
    console.log('Includes webgl:', data.includes('webgl'));
    console.log('Includes smoke:', data.includes('smoke'));
    console.log('Includes fragment:', data.includes('fragment') || data.includes('FRAGMENT'));
    // search for words
    const matches = data.match(/interactive|background|noise|particles|smoke|fluid/gi);
    console.log('Keywords:', matches);
  });
});

