// Renders the app icon from the SVG below and builds assets/icon.png + assets/icon.icns.
// Runs inside Electron (`npm run icon`) so the SVG is drawn by Chromium; no image tools or
// design files needed. The .icns step uses macOS's built-in `sips` and `iconutil`.
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets');

// 1024 canvas, macOS-style rounded square inset by 100px. A flat ember on warm paper, the
// same mark as the sidebar logo.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf9"/>
      <stop offset="1" stop-color="#f1ece4"/>
    </linearGradient>
    <filter id="lift" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#1c1917" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#paper)" filter="url(#lift)"/>
  <rect x="101" y="101" width="822" height="822" rx="184" fill="none" stroke="#1c1917" stroke-opacity="0.08" stroke-width="2"/>
  <!-- Ember: outer flame, inner flame, hearth -->
  <path d="M512 228 C 540 330 700 420 700 572 A 188 188 0 0 1 324 572 C 324 488 370 436 408 396 C 416 448 440 486 478 504 C 470 410 480 300 512 228 Z"
        fill="#d9571f"/>
  <path d="M520 470 C 538 528 612 560 612 628 A 100 100 0 0 1 412 628 C 412 590 432 566 452 548 C 458 574 470 590 490 598 C 486 552 496 506 520 470 Z"
        fill="#f6a066"/>
  <rect x="352" y="792" width="320" height="34" rx="17" fill="#d9571f" opacity="0.4"/>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });

  fs.mkdirSync(OUT, { recursive: true });
  const png = path.join(OUT, 'icon.png');
  fs.writeFileSync(png, image.resize({ width: 1024, height: 1024 }).toPNG());

  if (process.platform === 'darwin') {
    const set = path.join(OUT, 'icon.iconset');
    fs.rmSync(set, { recursive: true, force: true });
    fs.mkdirSync(set);
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const px = String(size * scale);
        const name = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
        execFileSync('sips', ['-z', px, px, png, '--out', path.join(set, name)], {
          stdio: 'ignore',
        });
      }
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(OUT, 'icon.icns')]);
    fs.rmSync(set, { recursive: true, force: true });
  }
  console.log('icon written to', OUT);
  app.quit();
});
