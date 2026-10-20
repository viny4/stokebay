# Decisions

One line per decision: date, decision, reason.

- 2026-10-19 — The app lives at the repo root, not in a `project-hud/` subfolder. — Keeps paths and scripts simple; the repo is the app.
- 2026-10-19 — `projects.status` is user-set only; "cold" is derived from `last_activity_at`. — Auto-pausing silently overrides user intent and produces pauses with no `where_i_stopped`, which defeats the resume card.
- 2026-10-19 — IDs are text ULIDs. — Integer IDs collide when merging data across devices (export/import, future sync).
- 2026-10-19 — Timestamps are UTC epoch milliseconds (integer). — One format avoids timezone and parsing bugs in timelines and inactivity maths.
- 2026-10-19 — Activity events are never updated, but are deleted with their project. — "Users own their data" requires that deleting a project removes its history.
- 2026-10-19 — Daily SQLite backup, keep last 7. — Local-first means a single corrupted file is otherwise total data loss.
- 2026-10-19 — No per-repo Git file watchers; refresh on window focus, project open and a slow sweep. — Hundreds of watchers hit inotify limits on Linux; this keeps cross-platform behaviour consistent.
- 2026-10-19 — MiniSearch deferred; FTS5 prefix queries handle type-ahead. — Avoids keeping two indexes in sync; revisit only if benchmarks show FTS5 is too slow.
- 2026-10-19 — FTS5 tables and triggers are hand-written SQL migrations. — Drizzle does not model virtual tables.
- 2026-10-19 — Keep Electron Forge + Vite; fall back to electron-vite + electron-builder only if `better-sqlite3` packaging can't be made reliable. — Spec says Forge; native module setup is the known risk.
- 2026-10-19 — v1 reordered: manual projects, pause/resume and HUD grid before scanner, Git and launcher. — Delivers the core value early and keeps non-coders first-class.
- 2026-10-19 — "Never remove existing functions" narrowed to bug fixes. — Literal reading would accumulate dead code.
- 2026-10-19 — Build a prototype before v1 (plan in docs/prototype-plan.md). — User wants to try the core idea before the full build.
- 2026-10-19 — Prototype stores data in one JSON file behind a repository interface; SQLite comes in v1. — Avoids the better-sqlite3 native build setup while the UX is still being tested; the interface keeps the swap contained.
- 2026-10-19 — Prototype keeps the working name "Project HUD"; "Keepfire" is the leading candidate. — Rename is a small change once the name is confirmed.
- 2026-10-19 — Adopted the "Workshop" vision (Ignite, the Lab, Parts Bin, Marks, Snap, Rewind, Universe, voice, Copilot, Gesture Mode), phased in docs/vision.md. — User wants a futuristic, sci-fi-lab experience for any kind of project, software or hardware.
- 2026-10-19 — Prototype gains Ignite, the Lab canvas and a per-project Parts Bin; the Lab replaces the planned Project Detail view. — Creating projects and adding any kind of resource is the heart of the new vision.
- 2026-10-19 — The Lab canvas uses React Flow (MIT). — Pan, zoom, objects and lines out of the box; tldraw is source-available and not allowed.
- 2026-10-19 — Exploded View and tree layouts use d3-hierarchy (ISC), not elkjs. — elkjs is EPL-2.0, outside the permissive-licence rule.
- 2026-10-19 — Copilot will run on node-llama-cpp inside the app instead of requiring Ollama; local AI moves from v3 to v2. — Ollama is a separate install most people won't do, and AI drafting is central to Ignite.
- 2026-10-19 — Files up to 200 MB dropped into a Lab are copied into the media folder; bigger files are linked in place. — Keeps resources safe when originals move, without filling the disk with videos and CAD files.
- 2026-10-19 — Resource activity events merged into one `resource_added` event with the type in the payload. — Otherwise every Lab object type needs its own event name.
- 2026-10-19 — The sci-fi look is our own: no Marvel / Iron Man names, logos, sounds or look-alike assets; the assistant gets its own name. — The app may be sold, and movie names and art are trademarked.
- 2026-10-19 — UI sounds are generated with the Web Audio API. — No sound files to license.
- 2026-10-19 — The prototype follows the user's rewritten docs/prototype-plan.md (HUD grid, projects, archive, pause/resume, detail, developer extras). Ignite, the Lab and the Parts Bin stay in docs/vision.md for later phases. — The user rewrote the plan and set the current phase; it supersedes the two Workshop-prototype lines above.
- 2026-10-19 — Look changed to "hologram blue": electric blue on deep navy, Orbitron for headings, Rajdhani for HUD labels, cut-corner frames. — User's choice; the first look didn't match what they imagined.
- 2026-10-19 — Orbitron and Rajdhani are bundled via @fontsource (fonts SIL OFL-1.1, package code MIT). — OFL isn't on the MIT/Apache/BSD/ISC list, but it is the standard font licence and allows bundling in commercial apps (only selling the font files on their own is barred). Flagged to the user.
- 2026-10-20 — Part prices are stored as integer hundredths of the currency (`unitCostMinor`), for every currency, and shown via Intl.NumberFormat. — Never floats; one rule is simpler than per-currency minor units (Intl hides decimals for currencies like JPY).
- 2026-10-20 — Lab files up to 200 MB are copied into `media/<projectId>/`; bigger ones are linked in place. Images are served through a `hud-media://entry/<id>` protocol that only resolves files belonging to a Lab entry. — Keeps resources safe when originals move, without exposing the filesystem to the renderer.
- 2026-10-19 — No git for now; the local repo created earlier was removed. — User's instruction. When git comes back, commits carry no AI attribution.
- 2026-10-20 — The app is named Stokebay (stoke = keep a fire going + bay = a workshop bay). On first launch it copies data from the old "Project HUD" folder; the old folder is left as a backup. — The user chose it; the name, GitHub, stokebay.app and the web were checked and free.
- 2026-10-20 — Folder backups: daily copy of the data file (30 days) plus an add-only mirror of Lab files into a user-chosen folder such as Google Drive; restore keeps the current file aside and restarts. — Protects against losing the Mac without accounts, servers or cost; the user's cloud app does the uploading.
