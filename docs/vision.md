# Vision: the Workshop

> This is the long-term plan. The prototype comes first: see `docs/prototype-plan.md`.
> Name: **Stokebay**.

## The big idea

A private workshop on your computer for every project you have: an app, a robot, an album, a thesis, anything.

- **Create** a project the way an inventor does in a sci-fi movie: say what you want to build and watch its blueprint assemble in front of you.
- **Build** it in its own **Lab**, where every file, photo, link, note, part and 3D model is an object you can move, group and connect.
- **Return** months later and the Lab rewinds to exactly where you stopped.

Everything runs on your own computer, works offline and is free. Camera, microphone and AI are extras you switch on yourself.

## How it should feel

- Like walking into your own lab: a dark blueprint grid, thin glowing lines, glass panels, and objects that react when you touch them.
- Fast and calm. Animations are short, never block you, and can always be skipped.
- Quiet UI sounds, generated in code, with one-click mute.
- Accessible: everything works with the keyboard, there's a reduced-motion mode (it follows the system setting), and a high-contrast mode.
- Inspired by movie labs like Tony Stark's workshop, but with our own design. There are no Marvel names, logos or sounds anywhere in the app (no "JARVIS", no "Stark", no arc-reactor art), because the app may be sold one day.

## Who it's for

| Person | Their project | What lives in its Lab |
|---|---|---|
| Developer | A rate-limiter library | Repo card, last commit, design notes, benchmark screenshots |
| Maker | A robot arm that sorts Lego | Sketches, 3D-print files, servo datasheets, parts bin, build photos, firmware repo |
| Musician | A six-song album | Demo recordings, lyrics, reference tracks, cover ideas |
| Student | A thesis | Papers (PDF), experiment notes, data files, feedback |
| Creator | A video series | Scripts, shot lists, clips, thumbnails |
| Anyone | A trip, a garden, a home repair | Links, photos, checklists, costs |

---

## Signature experiences

Fifteen experiences in four groups. Each one says what you'll see, how it works, and which phase it arrives in.

### Create

**1. Ignite: start a project like a lab moment**
Press `N` (later: just say "new project"). The screen dims and a blueprint grid powers up. Type what you want to build. The app suggests a blueprint, and the pieces assemble one by one: modules (for example Mechanics, Electronics, Code), a starter checklist, an empty parts bin, and a "Mark I" goal. Remove anything you don't want, press **Ignite**, and the new project flies into your HUD.
- *How:* blueprints are JSON files. The suggestion starts as a keyword match. In v2 the AI drafts the whole blueprint; the app checks the draft before using it, and you confirm every piece.
- *When:* prototype (no AI) → v2 (AI drafts from text or voice).

**2. Blueprints: starting points for any kind of project**
Software app, Hardware build, Electronics / IoT, 3D print / CAD, Music, Video, Writing, Research / study, Event, Blank. A blueprint sets the modules, the starter checklist, and whether the parts bin is on. You can save any project as your own blueprint and share blueprints as files.
- *When:* prototype (built-in set) → v1 (save your own) → later (opt-in community gallery).

### Build

**3. The Lab: each project's own workspace**
An endless canvas where everything is a live object: notes and checklists, images, files, links, PDFs with page previews, videos, code snippets, Git repos (branch, last commit, open in editor), voice memos (waveform and transcript), 3D models you can spin, and parts. Drag things in from Finder, paste them, or send them with Snap. Group objects into module zones and draw lines between related ones.
- *How:* a React Flow canvas with our own object types. Dropped files are copied into the app's media folder. pdf.js shows PDFs and three.js shows 3D models.
- *When:* prototype (notes, checklists, images, files, links, parts, basic repo card) → v1 (PDFs, video, code snippets, full repo cards) → v2 (voice memos, 3D models) → v3 (holographic 3D mode).

**4. Exploded View: see how it all fits together**
Press `E` and the project bursts apart: modules spread out, each opens into its parts and resources, and lines show what connects to what. Click any piece to dive in. Press `E` again and it snaps back together.
- *How:* layout from d3-hierarchy, animated with Motion. The 3D version uses react-three-fiber.
- *When:* v1 (2D) → v3 (3D).

**5. Parts Bin and Inventory: for anything physical**
Every project can keep a parts list: quantity, cost, where to buy, datasheet, and a status that moves from *needed* → *ordered* → *arrived* → *installed*. It shows the total cost and what's still missing. Your **Inventory** is your real drawers ("Drawer 3, box B"), and the app connects the two: *"You already have 2 of these servos. They're in Drone (paused)."* One shopping list covers every project.
- *When:* prototype (parts and totals per project) → v1 (inventory, matching across projects, shopping list) → later (opt-in supplier prices).

**6. Marks: versions of anything**
Like Mark I and Mark II of a suit. Save a Mark at each milestone and it freezes the Lab: resources, parts, notes, photos and the latest commit. Flip through Marks to watch the project grow, or put two side by side. It works for a robot, an album demo or a thesis draft, not just code.
- *How:* files are stored by content fingerprint (hash), so a Mark only stores what changed.
- *When:* v1.

**7. Snap: capture from anywhere**
A global shortcut opens a small floating orb over any app. Grab part of the screen, the clipboard, selected text, a file or a quick voice note, pick a project, and it lands in that Lab. Later, the AI suggests the project for you.
- *How:* Electron global shortcut, screen capture (macOS asks for screen-recording permission once), and a small always-on-top window.
- *When:* v1 → later (phone companion: photograph a part on your phone and it appears in the Lab, over your own Wi-Fi).

**8. Lab Sessions and the Focus Core**
Start a session ("working on the robot arm") and a small glowing core in the menu bar shows you're in it, with a timer. When you stop, the app gathers what happened (files changed in the project folder, commits, photos and notes added) and asks one question: *"Where did you stop?"* That answer feeds Rewind.
- *When:* v1.

### Return

**9. HUD Home**
All your projects as glowing boxes: bright when recently active, dimmer over time, and faded when cold (30+ days) with a "Pause this?" hint. Filter by world.
- *When:* prototype.

**10. Rewind: welcome back**
Open a project you haven't touched in months and the Lab replays your last session in about ten seconds: the last things you added fly back into place, your last commit and photo appear, then the resume card shows where you stopped and your next step. You can skip it at any time.
- *When:* prototype (animated resume card) → v1 (replay from session data) → v2 (an AI "previously on…" summary, made on your computer).

**11. Universe: all your projects at once**
Zoom all the way out: you're at the center, your worlds orbit you, and projects glow like stars. Active ones shine; cold ones drift outward and dim. Lines connect related projects. Keep zooming in to go from world to project to Lab to a single file, in one continuous zoom.
- *When:* v2 (2D) → v3 (3D).

### Control

**12. Command Bar**
Press `⌘K` and type anything: "new hardware project", "open drone", "add part", "show cold projects".
- *When:* prototype.

**13. Voice**
Hold a key and talk: *"Ignite a new project: a plant pot that waters itself."* *"What was I doing on the album?"* *"Add this screenshot to the drone."* Speech-to-text runs on your computer and nothing is sent anywhere.
- *How:* whisper.cpp (MIT) with Whisper models (MIT).
- *When:* v2 → later (optional wake word).

**14. Copilot: your lab assistant**
A local AI assistant you name yourself. It drafts blueprints for Ignite, suggests next steps, writes the "previously on…" summary, answers questions across everything you've saved (*"where's the motor driver datasheet?"*) and spots connections between projects.
- *How:* node-llama-cpp running in a separate Electron process (the same pattern as Electron's experimental `@electron/llm`), with semantic search through sqlite-vec. The model (1–4 GB) downloads only when you switch Copilot on, and only models with permissive licences are offered. You can also add your own cloud AI key for a stronger model.
- *When:* v2 → v3.

**15. Gesture Mode**
Switch on the webcam and work the Lab with your hands: pinch to grab a card, pull your hands apart to explode a module, twist to rotate a 3D model, flick to throw something away.
- *How:* MediaPipe Hand Landmarker (Apache-2.0), with the model bundled in the app and running on your computer. The camera stays off unless you turn this on, and an indicator shows whenever it's live.
- *Honest note:* great for show-and-play moments, tiring for all-day use. Mouse and keyboard stay the main way to work.
- *When:* v3.

---

## What's actually new

Each piece exists somewhere already. Nobody has put them together. (Research done 2026-10-19.)

| Piece | Who already does it | What's missing |
|---|---|---|
| Spatial canvas | Heptabase, Kosmik, Obsidian Canvas, AFFiNE ([2026 roundup](https://toolfinder.com/alternatives/heptabase)), [Ideon](https://alternativeto.net/software/ideon/about/) (has repo cards) | Built for notes and research, not for projects, parts or coming back to cold work |
| Parts list per project | [Maker Journal](https://apps.apple.com/us/app/maker-journal/id6756631515) (iPhone), [BOMIST](https://bomist.com/), [BOM-Trace](https://bomtrace.com/) | Hardware only: no software or creative projects, no canvas |
| "Iron Man" gesture interface | Hobby demos such as [J.E.S.T.E.R](https://github.com/heeelol/jester) and [STARK OS](https://flavortown.hackclub.com/projects/6837) | Demos, not tools you'd use every day |
| Local AI assistant | [Friday](https://www.producthunt.com/p/friday-open-source-jarvis/friday-11), [llama-assistant](https://www.sourcepulse.org/projects/1842451) | Not connected to your projects |
| Resume where you stopped | [Pause Marker](https://apps.apple.com/co/app/pause-marker/id6756863862) (iPhone) | No Lab, no desktop app, no project discovery |

**Our combination:** one private, offline place for *all* your projects (software, hardware and creative) where each project has its own Lab, parts are shared across projects, versions (Marks) work for physical things, code projects are found automatically, and the app rewinds you into anything you left behind.

---

## Phases

| Phase | Theme | What ships |
|---|---|---|
| **Prototype** (now) | Prove the feel | HUD Home, Ignite with built-in blueprints, the Lab (notes, checklists, images, files, links, parts), Parts Bin per project, pause and resume with the Rewind card, Command Bar, folder scan with repo cards and open in VS Code |
| **v1** | Make it solid | SQLite with backups and search, more Lab objects (PDF, video, code, full repo cards), Exploded View 2D, Inventory and shopping list, Marks, Snap, Lab Sessions and Focus Core, Rewind replay, your own blueprints, onboarding and settings, background scanning, `.dmg` installer |
| **v2** | Make it smart | Voice, Copilot (AI blueprints, next steps, "previously on…"), semantic search, voice memos, 3D model previews, Universe 2D, export and import |
| **v3** | Make it magic | 3D Lab, Universe and Exploded View, Gesture Mode, AI-found links between projects |
| **Later** | Reach everyone | Windows and Linux, phone companion, opt-in sync between your own devices, blueprint gallery, supplier prices, plugin API |

Every phase has to be useful on its own before the next one starts.

## Hard parts

- **AI models are big** (1–4 GB) and slow on older laptops. The app must be great without AI; Copilot is a bonus.
- **Hand tracking depends on light and camera quality.** It stays an optional mode.
- **3D can make the app feel slow.** 2D comes first; 3D is opt-in and checks the graphics card before it turns on.
- **Big files fill the disk.** Files up to 200 MB are copied into the app; bigger ones (videos, CAD files) are linked where they already are.
- **Too many features at once.** The phases are the guard: nothing from a later phase sneaks into an earlier one.
- **Legal.** Inspired by movies, never copied: no Marvel names, logos, sounds or look-alike assets.
