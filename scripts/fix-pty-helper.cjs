// node-pty's ready-built `spawn-helper` (the small program that starts each shell on macOS)
// arrives from npm without its "executable" bit, and then every terminal fails to start with
// "posix_spawnp failed". Runs after `npm install`; the packaged app gets the same fix in
// forge.config.mts.
const fs = require('node:fs');
const path = require('node:path');

const prebuilds = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
if (fs.existsSync(prebuilds)) {
  for (const dir of fs.readdirSync(prebuilds)) {
    const helper = path.join(prebuilds, dir, 'spawn-helper');
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  }
}
