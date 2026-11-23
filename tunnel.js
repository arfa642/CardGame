/**
 * Tunnel manager to expose localhost:3000 to the world
 */
const localtunnel = require('localtunnel');

(async () => {
  console.log('Starting public internet tunnel for Thulla Game (port 3000)...');
  try {
    const tunnel = await localtunnel({ port: 3000 });
    console.log('====================================================');
    console.log('🎉 PUBLIC WORLDWIDE URL:');
    console.log(tunnel.url);
    console.log('====================================================');

    tunnel.on('close', () => {
      console.log('Tunnel closed');
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });
  } catch (err) {
    console.error('Failed to start tunnel:', err);
  }
})();
