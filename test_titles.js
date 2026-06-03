const fs = require('fs');
const data = fs.readFileSync('C:\\Users\\Win 10\\.gemini\\antigravity\\agyhub_summaries_proto.pb', 'latin1');
const regex = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[\s\S]{1,30}?\x0a([^\x00]{1,150})/g;
let match;
while ((match = regex.exec(data)) !== null) {
  let str = match[2];
  if(str.charCodeAt(0) < 150) str = str.substring(1);
  const e = /^[A-Za-z0-9 _\-\.,:'"]+/.exec(str);
  if(e && e[0].length > 3) console.log(match[1], '=>', e[0]);
}
