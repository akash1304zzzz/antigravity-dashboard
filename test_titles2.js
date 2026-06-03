const fs = require('fs');
const data = fs.readFileSync('C:\\Users\\Win 10\\.gemini\\antigravity\\agyhub_summaries_proto.pb', 'latin1');
const regex = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[\s\S]{1,50}?([A-Z][A-Za-z0-9 _\-\.,:'"]{5,100})/g;
let match;
while ((match = regex.exec(data)) !== null) {
  console.log(match[1], '=>', match[2]);
}
