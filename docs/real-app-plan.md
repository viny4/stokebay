# Prototype 3: make it a real app

Builds on Prototype 1 (`docs/prototype-plan.md`) and Prototype 2 (`docs/ignite-lab-plan.md`). The goal: **open it from Applications or the Dock like any Mac app, with your data safe, and a friendly first run.**

## What you'll get

1. **An app icon** and a **`.dmg` installer** (`npm run make`). Drag Stokebay to Applications and open it like any other app.
2. **Daily backups:** once a day the data file is copied to `backups/projects-YYYY-MM-DD.json` in the app's data folder; the last 7 days are kept. (This is on top of the 5 rolling copies made on every save.)
3. **First-run setup** for a fresh install: welcome → pick your interests (they become worlds) → optionally scan a code folder → start empty or with example projects. Existing data skips it.
4. **Log files** in the installed app (`~/Library/Logs/Stokebay/`), one per day, kept for 14 days. Development keeps logging to the terminal.

## Notes

- The app isn't code-signed (that needs a paid Apple Developer account), so the first time macOS asks: right-click the app → **Open** → **Open**.
- Logs never contain note text, file contents or links, only ids and actions.

## Steps

1. Settings in the data file, onboarding IPC, daily backups, file logging; tests.
2. First-run setup screen.
3. App icon, `.dmg` maker, `npm run icon`.
4. Build the installer, install it, check it opens from Finder; then stop and report.
