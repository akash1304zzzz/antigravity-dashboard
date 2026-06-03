const http = require('http');

console.log('Testing existing server running on port 8080...');

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: 'GET',
      headers: headers
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function runTests() {
  let failed = false;

  try {
    // Test 1: Health endpoint (no auth needed)
    console.log('Test 1: Health endpoint (no auth)...');
    const healthRes = await get('/api/health');
    if (healthRes.statusCode !== 200) {
      console.error(`❌ Health endpoint returned status ${healthRes.statusCode}`);
      failed = true;
    } else {
      const data = JSON.parse(healthRes.body);
      if (data.status === 'ok') {
        console.log('✅ Health endpoint OK:', data);
      } else {
        console.error('❌ Health endpoint JSON status is not "ok"', data);
        failed = true;
      }
    }

    // Test 2: Projects endpoint (unauthorized)
    console.log('Test 2: Projects endpoint (unauthorized)...');
    const projUnauthRes = await get('/api/projects');
    if (projUnauthRes.statusCode !== 401) {
      console.error(`❌ Projects endpoint returned status ${projUnauthRes.statusCode} instead of 401`);
      failed = true;
    } else {
      console.log('✅ Projects endpoint unauthorized blocked correctly');
    }

    // Test 3: Projects endpoint (authorized)
    console.log('Test 3: Projects endpoint (authorized)...');
    const authHeader = 'Basic ' + Buffer.from('admin:AntiGravity2025!').toString('base64');
    const projAuthRes = await get('/api/projects', { 'Authorization': authHeader });
    if (projAuthRes.statusCode !== 200) {
      console.error(`❌ Projects endpoint returned status ${projAuthRes.statusCode} with auth`);
      failed = true;
    } else {
      const data = JSON.parse(projAuthRes.body);
      if (Array.isArray(data)) {
        console.log(`✅ Projects endpoint authorized OK. Found ${data.length} projects.`);
        console.log('Projects list:', data.map(p => p.name));
      } else {
        console.error('❌ Projects endpoint returned non-array:', data);
        failed = true;
      }
    }

    // Test 4: Conversations endpoint (authorized)
    console.log('Test 4: Conversations endpoint (authorized)...');
    const convAuthRes = await get('/api/conversations', { 'Authorization': authHeader });
    if (convAuthRes.statusCode !== 200) {
      console.error(`❌ Conversations endpoint returned status ${convAuthRes.statusCode} with auth`);
      failed = true;
    } else {
      const data = JSON.parse(convAuthRes.body);
      if (Array.isArray(data)) {
        console.log(`✅ Conversations endpoint authorized OK. Found ${data.length} conversations.`);
        console.log('Recent 5 conversations:', data.slice(0, 5).map(c => ({ id: c.id, summary: c.firstMessage })));
      } else {
        console.error('❌ Conversations endpoint returned non-array:', data);
        failed = true;
      }
    }

  } catch (err) {
    console.error('❌ Unexpected error during tests:', err);
    failed = true;
  } finally {
    if (failed) {
      console.error('❌ Antigravity API Tests Failed');
      process.exit(1);
    } else {
      console.log('🎉 All Antigravity API Tests Passed Successfully against the running instance!');
      process.exit(0);
    }
  }
}

runTests();
