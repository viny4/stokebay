// Renders the app icon from the SVG below and builds assets/icon.png + assets/icon.icns.
// Runs inside Electron (`npm run icon`) so the SVG is drawn by Chromium; no image tools or
// design files needed. The .icns step uses macOS's built-in `sips` and `iconutil`.
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets');

// 1024 canvas, macOS-style rounded square inset by 100px. A glowing flame (Ignite) inside a
// hexagon ring, on a deep-navy blueprint grid: the HUD look in one mark.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="28%" r="80%">
      <stop offset="0" stop-color="#0f3d66"/>
      <stop offset="0.55" stop-color="#062039"/>
      <stop offset="1" stop-color="#020a17"/>
    </radialGradient>
    <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#38d6ff"/>
      <stop offset="0.6" stop-color="#9eeaff"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#38bdf8" stroke-opacity="0.12" stroke-width="2"/>
    </pattern>
    <clipPath id="shape"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath>
  </defs>
  <g clip-path="url(#shape)">
    <rect x="100" y="100" width="824" height="824" fill="url(#bg)"/>
    <rect x="100" y="100" width="824" height="824" fill="url(#grid)"/>
  </g>
  <rect x="104" y="104" width="816" height="816" rx="181" fill="none" stroke="#38bdf8" stroke-opacity="0.45" stroke-width="6"/>
  <!-- HUD corner brackets -->
  <g stroke="#38d6ff" stroke-width="10" stroke-linecap="square" fill="none" opacity="0.8">
    <path d="M230 300V230H300"/><path d="M724 230H794V300"/>
    <path d="M794 724V794H724"/><path d="M300 794H230V724"/>
  </g>
  <!-- Hexagon ring -->
  <polygon points="512,262 728,387 728,637 512,762 296,637 296,387"
           fill="none" stroke="#38d6ff" stroke-width="18" stroke-linejoin="round" filter="url(#glow)"/>
  <!-- Flame -->
  <path d="M512 352 C 584 438 626 500 600 572 C 584 616 548 642 512 650 C 476 642 440 616 424 572 C 398 500 440 438 512 352 Z"
        fill="url(#flame)" filter="url(#glow)"/>
  <path d="M512 470 C 546 512 560 548 546 584 C 538 604 526 614 512 618 C 498 614 486 604 478 584 C 464 548 478 512 512 470 Z"
        fill="#020a17" opacity="0.55"/>
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
