# Prototype plan

The goal is a desktop app you can open and use within a few days. It should prove the core idea: **see all your projects at a glance, notice which ones have gone cold, and pick one back up from a resume card.**

Everything else in the project spec (SQLite, full-text search, onboarding, tree view, packaging) waits until after the prototype has been used and feedback is collected.

> **Build note:** this is the current phase. Follow this plan only. Work through steps 1 to 7 autonomously, then **stop** at step 8 and wait for the user's feedback. Do not start v1 items yet.

---

## What you'll be able to do

1. Open the app and see your projects as glowing boxes on a dark HUD screen.
2. Add a project by hand: title, world (interest area), status, and an optional folder.
3. See at a glance which active projects are hot (bright), cooling down (dim) or cold (faded).
4. Filter the grid by world and search by title.
5. Pause a project and write down "where I stopped" and "next step".
6. Open a paused project and see the resume card first, then click **Resume**.
7. Keep notes and links on a project, and see a simple timeline of what happened.
8. *(Developer extras)* Pick a folder, have the app find the code projects inside it, show each one's last commit, and open it in VS Code.

```
┌──────────────────────────────────────────────────────────────┐
│  PROJECT HUD                         [+ New]   ( search… )   │
│  [All] [Coding] [Music] [Writing] [Health]                   │
│                                                              │
│  ┏━━━━━━━━━━━━━┓  ┏━━━━━━━━━━━━━┓  ┌─────────────┐           │
│  ┃ Rate limiter┃  ┃ Portfolio   ┃  │ Guitar album│  (faded)  │
│  ┃ ● active    ┃  ┃ ● active    ┃  │ ○ cold 41d  │           │
│  ┃ 2h ago      ┃  ┃ 3d ago      ┃  │ Pause this? │           │
│  ┗━━━━━━━━━━━━━┛  ┗━━━━━━━━━━━━━┛  └─────────────┘           │
│                                                              │
│  ┌ RESUME ───────────────────────────────────────────┐       │
│  │ Outbox pattern · paused 12 days ago               │       │
│  │ Where I stopped: retry logic half written         │       │
│  │ Next step: add the dead-letter table              │       │
│  │                        [Resume]  [Open in VS Code]│       │
│  └───────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

---

## Key rules for the prototype

**Last activity**
- For every project: the newest of its activity events.
- For projects with a Git folder: the newest of its activity events **and** its last commit date.

**Status and glow**
- Status colours: active = cyan, paused = amber, done = green, idea = violet.
- Glow applies to **active** projects only, based on days since last activity:

| Days since last activity | Glow |
|---|---|
| 0–3 | Bright |
| 4–14 | Medium |
| 15–29 | Dim |
| 30+ | Cold: faded, with a "Pause this?" hint |

- Paused projects stay a steady amber (they were paused on purpose). Done and idea projects keep their colour with no glow changes.

**Data safety**
- Data is one JSON file in the app's data folder, written atomically (write to a temp file, then rename).
- Before each write, keep a copy of the previous file. Keep the **last 5 copies** (`projects.json.1` … `projects.json.5`).
- Deleting a project moves it to **Archived** instead of removing it. Archived projects are hidden from the grid and can be restored. Permanent delete is only available from the Archived list, with confirmation.

---

## Steps

Each step ends with something you can run and see. (No git during this phase.)

### 1. Scaffold the desktop app
- Electron Forge + Vite + React + TypeScript (strict) + Tailwind + Framer Motion.
- Secure window settings from day one: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- ESLint + Prettier + Vitest wired up.
- Create `docs/decisions.md` and `docs/feedback.md` (empty templates).

**Done when:** `npm start` opens an empty dark window, and `npm run typecheck`, `npm run lint` and `npm test` pass.

### 2. Data and the bridge between UI and app
- Typed `window.api` in the preload script; IPC channels named `domain:action` (`projects:list`, `projects:create`, …).
- Every payload validated with zod in the main process.
- JSON store with atomic writes and the 5 rolling backups described above.
- The store sits behind a small interface (`listProjects`, `createProject`, `updateProject`, `archiveProject`, `restoreProject`, `addEntry`, `addEvent`, …) so SQLite can replace it in v1 without touching the UI.
- ULID ids and UTC millisecond timestamps, so the data carries over to v1.
- Sample data uses generic example projects, nothing personal.
- Errors from the renderer are forwarded to the main process and logged to the console with a clear prefix.

**Done when:** the app loads sample projects from the JSON file, and unit tests cover the store (create, update, archive, restore, atomic write, backup rotation).

### 3. HUD grid
- Project cards with status colours and glow, following the rules above.
- World filter chips across the top.
- Search box that filters cards by title as you type (simple in-memory match, case-insensitive).
- Hover and enter animations with Framer Motion; arrow-key navigation between cards, Enter to open.

**Done when:** the grid shows the sample projects with the right colour and glow, and filters and search work together.

### 4. Add, edit and archive projects
- **New project** dialog: title, worlds, status, optional folder (system folder picker).
- Edit and archive from the card's menu.
- An **Archived** view lists archived projects with **Restore** and **Delete permanently** (with confirmation).
- Each change records an activity event (`project_created`, `project_updated`, `project_archived`, `project_restored`).

**Done when:** you can add, edit, archive and restore projects, and they persist after restarting the app.

### 5. Pause and resume
- **Pause** asks for "where I stopped" and "next step", and records `project_paused`.
- Opening a paused project shows the resume card first; **Resume** sets it back to active and records `project_resumed`.
- The "Pause this?" hint on cold cards opens the same pause dialog.

**Done when:** you can pause a project, restart the app, open it, and see your note on the resume card.

### 6. Project detail
- Side panel with the resume card at the top (when paused), then notes, links and the timeline.
- Notes are plain text for now (TipTap comes later); links are a title + URL, opened in the default browser.
- Adding a note or link records `note_added` / `link_added`.
- The timeline lists the project's activity events, newest first.

**Done when:** you can add notes and links and see them on the timeline.

### 7. Developer extras
- **Scan a folder:** pick a folder and look up to **3 levels** deep for `.git` or `package.json`.
  - Skip `node_modules`, `dist`, `build`, `.next`, `venv`, and hidden folders.
  - Once a folder contains `.git`, treat it as one project and **do not look deeper inside it** (avoids listing monorepo sub-packages separately).
  - Show the results as a checklist to import; skip folders already imported.
- **Last commit:** for projects with a Git folder, show the last commit date and message (via `simple-git`).
  - Refresh when the app window gets focus, with at most **4 git processes at a time**.
  - Cache results in the JSON store so the grid never waits on Git.
  - Use the commit date in "last activity" (see rules above).
- **Open in VS Code:**
  - Try `code <path>` with `execFile` and an argument array.
  - If `code` isn't found (common on macOS, where apps launched from Finder don't inherit the terminal's PATH), fall back to `open -a "Visual Studio Code" <path>`.
  - If both fail, show a friendly message explaining how to install the `code` command.
- **Reveal in Finder** using Electron's `shell.showItemInFolder`.
- Record `opened_in_editor` events.

**Done when:** scanning a folder finds real repos without duplicates, cards show their last commit, and **Open in VS Code** works when launched both from the terminal and from Finder.

### 8. Try it and decide (stop here)
- The build stops and reports what was built.
- The user uses the prototype on their own projects for a few days and writes notes in `docs/feedback.md` under three headings: **Felt good**, **Missing**, **Annoying**.
- That feedback shapes v1.

---

## Not in the prototype

These are in the full spec but wait until after feedback:

- SQLite, Drizzle migrations, FTS5 search
- pino log rotation, perf wrapper, dev log panel (the prototype logs to the console)
- First-run onboarding and the settings screen (defaults are built in)
- Tree view, 3D, audio/video/media, export/import, AI features
- Background jobs and automatic file watching (the prototype scans only when asked)
- Packaging a `.dmg` (run it with `npm start`)

## What carries over to v1

The scaffold, security settings, IPC bridge, shared types and UI components all stay. The JSON store is replaced by SQLite behind the same interface, and existing data is migrated using the same ULIDs and timestamps. The scanner and Git code move into background jobs.
