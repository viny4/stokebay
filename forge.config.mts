import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BUNDLE_ID = 'app.stokebay.desktop';

/**
 * Without a paid Apple certificate the app is signed "ad hoc", and by default an ad-hoc
 * signature's identity is a fingerprint that changes with every build. macOS ties privacy
 * permissions (like access to the Google Drive folder) to that identity, so each update would
 * silently lose them. Signing inside-out and then giving the app a designated requirement of
 * just its bundle id keeps the identity the same across builds.
 */
function signAdHocWithStableIdentity(app: string): void {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app]);
  execFileSync('codesign', [
    '--force',
    '--sign',
    '-',
    '--identifier',
    BUNDLE_ID,
    '--requirements',
    `=designated => identifier "${BUNDLE_ID}"`,
    app,
  ]);
  execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
}

/**
 * The Vite build bundles everything into .vite/, so the app ships without node_modules. node-pty
 * (the built-in terminal) can't be bundled: it loads a native binary and starts a helper program
 * from its own folder. Copy just what it needs at runtime for this platform, executable bit
 * included; asar `unpack` below keeps those files real files on disk.
 */
function copyNodePty(buildPath: string, platform: string, arch: string): void {
  const from = path.resolve('node_modules', 'node-pty');
  const to = path.join(buildPath, 'node_modules', 'node-pty');
  const prebuild = path.join('prebuilds', `${platform}-${arch}`);
  if (!fs.existsSync(path.join(from, prebuild))) {
    throw new Error(`node-pty has no ready-built binary for ${platform}-${arch}`);
  }
  for (const part of ['package.json', 'LICENSE', 'lib', prebuild]) {
    fs.cpSync(path.join(from, part), path.join(to, part), { recursive: true });
  }
  const helper = path.join(to, prebuild, 'spawn-helper');
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: { unpack: '**/node_modules/node-pty/**' },
    // No extension: the packager picks icon.icns on macOS (built by `npm run icon`).
    icon: 'assets/icon',
    appBundleId: BUNDLE_ID,
    appCategoryType: 'public.app-category.productivity',
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG({ format: 'ULFO', icon: 'assets/icon.icns' }, ['darwin']),
    new MakerZIP({}, ['darwin']),
    new MakerSquirrel({}),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  hooks: {
    packageAfterCopy: async (_config, buildPath, _electronVersion, platform, arch) => {
      copyNodePty(buildPath, platform, arch);
    },
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== 'darwin') return;
      for (const dir of outputPaths) signAdHocWithStableIdentity(path.join(dir, 'Stokebay.app'));
    },
  },
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses switch off Electron features the app never needs, at package time.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
