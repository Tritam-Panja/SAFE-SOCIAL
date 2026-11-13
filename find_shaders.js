const fs = require('fs');

const code = fs.readFileSync('toplevel-deps.js', 'utf8');

// Find gn and _n which are the vertex and fragment shader strings for hn
const gnMatch = code.match(/gn\s*=\s*`([\s\S]*?)`/);
const _nMatch = code.match(/_n\s*=\s*`([\s\S]*?)`/);
const mnMatch = code.match(/function\s+mn[\s\S]*?\}/);

console.log('gn vertex shader:\n', gnMatch ? gnMatch[1] : 'not found');
console.log('--- _n fragment shader ---\n', _nMatch ? _nMatch[1] : 'not found');
console.log('--- mn color parser ---\n', mnMatch ? mnMatch[0] : 'not found');

