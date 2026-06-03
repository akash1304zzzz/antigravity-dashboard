const { spawn } = require('child_process');
const http = require('http');

console.log('Starting Antigravity backend test...');

const serverProcess = spawn('node', ['server.js'], {
  cwd: __dirname,
  env: { ...process.env }
});

let serverOutput = '';
let serverStarted = false;

serverProcess.stdout.on('data', (data) => {
  const str = data.toString();
  serverOutput += str;
  process.stdout.write('[Server stdout] ' + str);
  if (str.includes('Antigravity Mobile Dashboard server running')) {
    serverStarted = true;
    runTests();
  }
});

serverProcess.stderr.on('data', (data) => {
  console.error('[Server stderr] ' + data.toString());
});

serverProcess.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
  if (!serverStarted) {
    console.error('Server failed to start or did not output the running message.');
    process.exit(1);
  }
});

// Timeout if server doesn't start in 5 seconds
const startupTimeout = setTimeout(() => {
  if (!serverStarted) {
    console.error('Timeout waiting for server to start.');
    serverProcess.kill();
    process.exit(1);
  }
}, 5000);

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
  clearTimeout(startupTimeout);
  console.log('\nRunning API tests...');
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
        console.log('✅ Health endpoint OK');
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
      } else {
        console.error('❌ Conversations endpoint returned non-array:', data);
        failed = true;
      }
    }

  } catch (err) {
    console.error('❌ Unexpected error during tests:', err);
    failed = true;
  } finally {
    console.log('\nShutting down test server...');
    serverProcess.kill();
    
    if (failed) {
      console.error('❌ Antigravity API Tests Failed');
      process.exit(1);
    } else {
      console.log('🎉 All Antigravity API Tests Passed Successfully!');
      process.exit(0);
    }
  }
}
