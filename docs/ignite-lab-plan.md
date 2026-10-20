# Prototype 2: Ignite and the Lab

Builds on the finished prototype (`docs/prototype-plan.md`). The goal: **create a project like a sci-fi lab moment, and keep everything for it in its own Lab.** Software, hardware or anything else. Long-term ideas stay in `docs/vision.md`.

---

## What you'll be able to do

1. **Ignite a new project.** Press `N` (or **+ Ignite**). The screen dims, a blueprint grid powers up, you type what you want to build, and the app suggests a blueprint. Its modules, starter checklist and parts bin assemble one by one. Press **Ignite** and the project flies into the HUD.
2. **Enter the project's Lab.** A full-screen canvas for that project. Drop in files and images from Finder, paste links and images, write notes and checklists, add parts. Move things around, group them into module zones, draw lines between related things.
3. **Use the Parts Bin** for anything physical: quantity, cost, where to buy, status (needed → ordered → arrived → installed), total cost and what's still missing.

The HUD grid, detail panel, pause/resume and resume card all stay as they are.

---

## Blueprints

Built-in blueprints are JSON files in `resources/blueprints/`. Each one has a name, a kind, keywords (for the suggestion), modules, whether the parts bin is on, and a starter checklist.

Built-in set: Software app, Hardware build, Electronics / IoT, Creative (music, art, video, writing), Research / study, Blank.

The suggestion is a keyword match on the idea text. AI drafting comes later (vision v2).

## Lab objects

| Object | What it holds |
|---|---|
| Note | Title + text |
| Checklist | Title + items you can tick |
| Link | Title + URL (opens in the browser) |
| Image | A picture, shown on the canvas |
| File | Any file; opens with its default app |
| Part | Links to a row in the Parts Bin |
| Module zone | A labelled area that groups other objects |

Lines between objects are saved too.

## Files

- Files dropped into a Lab are **copied** into the app's data folder (`media/<projectId>/`), so they stay safe if the original moves. Files over 200 MB are **linked** where they are instead.
- Images are shown through a private `hud-media://` address that can only read that media folder.

## Rules

- Everything stays local and offline.
- Each Lab action is one save (one backup slot).
- Deleting an object from the Lab asks first; a copied file is removed with it.
- Every new kind of action is recorded on the timeline.

---

## Steps

1. **Data and bridge:** blueprints, modules, Lab items, parts, canvas positions and lines in the store; IPC for all of it; the `hud-media://` protocol; tests.
2. **Ignite screen:** the full-screen create flow with the assembly animation. Replaces the plain New project dialog (the dialog stays for Edit).
3. **The Lab:** the full-screen canvas (React Flow), all object types, drag and drop, paste, zones, lines, positions saved.
4. **Parts Bin:** the table, statuses, totals; part cards on the canvas show the same data.
5. **Check everything in the running app, then stop and report.**

Not in this phase: AI, voice, gestures, 3D, Marks, Snap, Exploded View, Universe, cross-project inventory, PDF/video previews.
