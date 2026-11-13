const fs = require('fs');

const code = fs.readFileSync('toplevel-deps.js', 'utf8');

// Find function hn and function fn and _e
function dumpDef(name) {
  const match = code.match(new RegExp(`(?:var|function)\\s+${name}\\b[\\s\\S]{0,3500}`));
  if (match) {
    console.log(`=== DEF OF ${name} ===`);
    console.log(match[0].slice(0, 3000));
  } else {
    // try finding where it's assigned
    const assign = code.match(new RegExp(`${name}\\s*=\\s*[\\s\\S]{0,3500}`));
    if (assign) {
      console.log(`=== ASSIGN OF ${name} ===`);
      console.log(assign[0].slice(0, 3000));
    }
  }
}

dumpDef('hn'); // Interactive Background
dumpDef('fn'); // Custom Cursor
dumpDef('_e'); // Lenis Smooth scroll or noise!

