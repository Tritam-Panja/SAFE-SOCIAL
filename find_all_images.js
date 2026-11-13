const fs = require('fs');

const bundle = fs.readFileSync('homepage_bundle.js', 'utf8');

// Find all image URLs and their associated data-framer-name or title
const matches = [...bundle.matchAll(/data-framer-name["']?:\s*`([^`]+)`[\s\S]{0,300}?(https:\/\/framerusercontent\.com\/images\/[^`"'\s]+)/g)];
console.log('Matches with name then image:');
matches.forEach(m => console.log(m[1], '-->', m[2]));

const matches2 = [...bundle.matchAll(/(https:\/\/framerusercontent\.com\/images\/[^`"'\s]+)[\s\S]{0,400}?data-framer-name["']?:\s*`([^`]+)`/g)];
console.log('Matches with image then name:');
matches2.forEach(m => console.log(m[2], '-->', m[1]));

// Also print all unique image URLs
const allImgs = [...new Set(bundle.match(/https:\/\/framerusercontent\.com\/images\/[a-zA-Z0-9_\-\.]+\.(jpg|png|webp|svg)/g))];
console.log('All unique image URLs in homepage:');
allImgs.forEach(img => console.log(img));

