const fs = require('fs');
let t = fs.readFileSync('public/app.js', 'utf8');

// The file start is messed up. Let's rebuild the start properly.
// Remove any partial starts.
t = t.replace(/^\s*\/\* ============================================\s*[\s\S]*?\*\/[\s\n]*/, '');
t = t.replace(/^\s*\(function \(\) \{\s*'use strict';[\s\n]*/, '');

t = `/* ============================================
   Antigravity 2.0 — Mobile Command Center
   Frontend Application Logic
   ============================================ */

(function () {
    'use strict';

` + t;

// Fix the wrong returns
t = t.replace(/if \(!dateStr\) return '📁';/, `if (!dateStr) return '';`);
t = t.replace(/return 'ðŸ“ ';\s*\}/, `return '📁';\n    }`);

fs.writeFileSync('public/app.js', t, 'utf8');
console.log('Fixed');
