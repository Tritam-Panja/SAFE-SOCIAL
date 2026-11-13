const fs = require('fs');
const html = fs.readFileSync('nocturno_live.html', 'utf8');

// Find all image URLs with their context or alt/dimensions
const imgRegex = /https:\/\/framerusercontent\.com\/images\/[a-zA-Z0-9_\-\.]+/g;
const uniqueImages = [...new Set(html.match(imgRegex))];
console.log('Unique Framer images count:', uniqueImages.length);
uniqueImages.forEach((img, idx) => console.log(`${idx}: ${img}`));

// Let's also check for canvas or 3D / spline / video / lottie
console.log('Canvas tags:', (html.match(/<canvas[^>]*>/g) || []).length);
console.log('Video tags:', (html.match(/<video[^>]*>/g) || []).length);
console.log('Iframe tags:', (html.match(/<iframe[^>]*>/g) || []).length);

// Check for WebGL or Three.js or shader code
const hasThree = html.includes('three') || html.includes('THREE') || html.includes('webgl');
console.log('Mentions webgl / three:', hasThree);

