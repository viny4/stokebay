# Releasing

Installers for every platform are built by GitHub Actions (`.github/workflows/release.yml`), on
real macOS, Windows and Linux machines. Nothing is published until you press **Publish**.

| Platform | Files |
| --- | --- |
| macOS (Apple silicon and Intel) | `.dmg` and `.zip` for `arm64` and `x64` |
| Windows | `Stokebay-… Setup.exe` |
| Linux | `.deb` and `.rpm` |

## Try a build without releasing

GitHub → **Actions** → **Release** → **Run workflow**. When it finishes, the installers are under
**Artifacts** on the run's page. Use this to check the Windows and Linux builds before a release.

## Make a release

1. Make sure `main` is pushed and the **CI** check is green.
2. Pick the new version (e.g. `0.3.0`) and run:

   ```bash
   npm version 0.3.0          # updates package.json and makes a commit + tag v0.3.0
   git push origin main --follow-tags
   ```

   The version in `package.json` must match the tag; the build stops if they differ.

3. Wait for **Release** to finish (about 15 minutes). It creates a **draft** release with all
   the installers and notes made from `.github/release-notes.md` plus the changes since the last
   release.
4. Open the draft under **Releases**, read it over, and click **Publish release**.

## If a build fails

Fix it on `main`, then move the tag to the fixed commit and push it again:

```bash
git tag -d v0.3.0 && git push origin :refs/tags/v0.3.0   # remove the old tag
git tag v0.3.0 && git push origin v0.3.0                 # tag the fixed commit
```

Delete the old draft release first if one was created.

## Signing (not set up yet)

- **macOS:** builds are signed ad hoc, so people click **Open Anyway** once. Removing that needs
  an Apple Developer account ($99/year) for a Developer ID certificate and notarization.
- **Windows:** unsigned, so SmartScreen warns until the app is signed with a code-signing
  certificate.
