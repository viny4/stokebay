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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
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
