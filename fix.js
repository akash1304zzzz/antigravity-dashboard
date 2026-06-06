const fs = require('fs');
let t = fs.readFileSync('public/app.js', 'utf8');

// Fix map
t = t.replace(/const map = \{[\s\S]*?\};/, `const map = {
            'antigravityphone': '📱',
            'hms': '🏥',
            'yogaschoolsrishikesh': '🧘',
            'khakara': '🍪',
            'instagram': '📸',
            'ai_audit': '🎙️',
            'understanding': '📚',
        };`);

// Fix folder return
t = t.replace(/return '.*?';/, `return '📁';`);

// Fix toast icons
t = t.replace(/success: '.*?',/, `success: '✓',`);
t = t.replace(/error: '.*?',/, `error: '✕',`);
t = t.replace(/info: '.*?',/, `info: 'ℹ',`);
t = t.replace(/<span>\$\{icons\[type\] \|\| '.*?'\}<\/span>/, `<span>\${icons[type] || 'ℹ'}</span>`);

// Fix chat symbols
t = t.replace(/<div class="message-thinking">.*? \$\{/g, `<div class="message-thinking">💭 \${`);
t = t.replace(/<div class="message-tool-calls">.*? \$\{/g, `<div class="message-tool-calls">🔧 \${`);
t = t.replace(/msgDiv\.querySelector\('\.message-meta'\)\.textContent = 'Sent .*?';/g, `msgDiv.querySelector('.message-meta').textContent = 'Sent ✓';`);

// Fix warning symbol
t = t.replace(/<span class="quota-warning" title="Quota empty">.*?<\/span>/g, `<span class="quota-warning" title="Quota empty">⚠️</span>`);

fs.writeFileSync('public/app.js', t, 'utf8');
console.log("Done");
