const localtunnel = require('localtunnel');

async function startTunnel() {
  try {
    console.log('[Tunnel] Starting localtunnel on port 8080...');
    const tunnel = await localtunnel({ port: 8080 });

    console.log(`[Tunnel] URL: ${tunnel.url}`);

    tunnel.on('close', () => {
      console.log('[Tunnel] Tunnel closed. Reconnecting in 5 seconds...');
      setTimeout(startTunnel, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('[Tunnel] Error:', err.message);
    });
  } catch (err) {
    console.error('[Tunnel] Failed to start:', err.message);
    console.log('[Tunnel] Retrying in 5 seconds...');
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();
