const fs = require('fs');
const data = fs.readFileSync('C:\\Users\\Win 10\\.gemini\\antigravity\\agyhub_summaries_proto.pb', 'latin1');
const uuids = [...data.matchAll(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g)];
for (let match of uuids) {
  const idx = match.index;
  const chunk = data.substring(idx + 36, idx + 200);
  const titleMatch = chunk.match(/\x12[^\x0a\x12]{0,5}\x0a.([A-Z][A-Za-z0-9 _\-\.,:'"]{5,100})/);
  if (titleMatch) {
    console.log(match[1], '=>', titleMatch[1]);
  } else {
    // try looser
    const loose = chunk.match(/\x0a.([A-Z][A-Za-z0-9 _\-\.,:'"]{5,100})/);
    if (loose) console.log(match[1], '=>', loose[1], '(loose)');
  }
}
