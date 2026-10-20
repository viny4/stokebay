<p align="center">
  <img src="assets/icon.png" width="96" alt="" />
</p>

<h1 align="center">Stokebay</h1>

<p align="center">
  One calm place for every project you care about, and a way back in when you return to one.
</p>

<p align="center">
  <img src="docs/screenshots/projects.png" alt="All projects in Stokebay" width="860" />
</p>

Most of us have more projects than we can keep in our heads: an app half-built, a guitar
album, a robot arm waiting on parts, a course we meant to finish. Stokebay keeps them in one
place, notices which ones have gone quiet, and when you open one again it tells you where you
stopped and what you meant to do next.

It runs on your computer, works offline, needs no account and is free.

## What it does

- **All your projects, any kind.** Software, hardware, music, writing, learning. Group them
  into worlds you choose.
- **Pick up where you left off.** Pausing a project asks two questions: where did you stop, and
  what's next. Next time you open it, that's the first thing you see.
- **Notices what's gone cold.** Projects you haven't touched in a while fade, with a gentle
  prompt to pause them properly.
- **A Lab for each project.** A whiteboard for notes, checklists, links, images and files,
  arranged in zones.
- **Parts Bin.** For physical builds: what to buy, what it costs, what has arrived.
- **Map.** Every project as a dot around you: the closer to the middle, the more recently you
  worked on it.
- **Finds your code.** Point it at a folder and it picks up your Git projects, with the branch
  and last commit on each card, and opens them in your editor (VS Code, Cursor, Zed, Windsurf
  or Sublime Text).
- **Backups you control.** A copy every day on your computer, plus an optional daily copy into
  any folder, such as Google Drive or Dropbox, with one-click restore.

|                                                             |                                                   |
| ----------------------------------------------------------- | ------------------------------------------------- |
| ![Resume card](docs/screenshots/resume.png)                 | ![New project](docs/screenshots/new-project.png)  |
| ![The Lab](docs/screenshots/lab.png)                        | ![Map](docs/screenshots/map.png)                  |

Light and dark mode follow your system.

<p align="center">
  <img src="docs/screenshots/projects-dark.png" alt="Stokebay in dark mode" width="860" />
</p>

## Download

Get the latest `.dmg` from the [Releases](https://github.com/viny4/stokebay/releases) page
(macOS on Apple silicon). Windows and Linux builds are planned.

The app isn't signed with an Apple developer certificate yet, so the first time you open it
macOS will say it can't check it. Right-click **Stokebay** in Applications, choose **Open**, then
**Open** again. You only need to do this once.

## Your data

Everything stays on your computer, in one data file plus your Lab files
(`~/Library/Application Support/Stokebay` on macOS). Settings → **Show data folder** opens it.
Nothing is sent anywhere.

## Build from source

You'll need Node.js 22 or newer and Git.

```bash
git clone https://github.com/viny4/stokebay.git
cd stokebay
npm install
npm start          # run in development
npm run make       # build the .dmg and .zip into out/make
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

Built with Electron, React, TypeScript, Tailwind CSS and React Flow.

## Licence

Stokebay is free software under the [GNU Affero General Public License v3.0](LICENSE). You can
use, study, change and share it; if you share a changed version, including running it as a
service, you share your changes under the same licence.
