# Blacktop Dominion 3D Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a root launcher that lets the player choose between the current 2D game and a new separate 3D prototype built from the imported `GLB` assets.

**Architecture:** Keep the current 2D game runtime in place and load it only after the user chooses the 2D option. Build the 3D prototype as a separate app under `three-d/` with its own HTML, CSS, renderer, scene setup, and gameplay loop. Use small testable modules for the 3D asset manifest and scene layout, then wire the browser runtime on top.

**Tech Stack:** Static HTML/CSS/ES modules, Three.js, GLTFLoader, Node built-in test runner, Playwright skill-client, Python `http.server`

---

### Task 1: Set up tests and 3D asset manifest

**Files:**
- Create: `three-d/tests/asset-manifest.test.js`
- Create: `three-d/src/asset-manifest.js`
- Modify: `package.json`

**Step 1: Write the failing test**

Create a Node test that imports `../src/asset-manifest.js` and asserts:

- the manifest exports categories for `buildings`, `roads`, `vehicles`, `guns`, `characters`
- each category contains at least one asset
- all manifest paths point to `.glb` files

**Step 2: Run test to verify it fails**

Run: `node --test three-d/tests/asset-manifest.test.js`
Expected: FAIL because the module does not exist yet.

**Step 3: Write minimal implementation**

Create `three-d/src/asset-manifest.js` with stable IDs and relative paths for the currently verified assets.

**Step 4: Run test to verify it passes**

Run: `node --test three-d/tests/asset-manifest.test.js`
Expected: PASS

**Step 5: Install runtime dependency**

Run: `npm install three@0.183.2`
Expected: `package.json` and `package-lock.json` updated with a local browser-usable Three.js dependency.

### Task 2: Add testable scene layout data

**Files:**
- Create: `three-d/tests/layout.test.js`
- Create: `three-d/src/layout.js`

**Step 1: Write the failing test**

Create a Node test that asserts `createPrototypeLayout()` returns:

- a non-empty roads array
- a non-empty buildings array
- a non-empty vehicles array
- a non-empty characters array
- a non-empty props array
- at least one playable spawn point

**Step 2: Run test to verify it fails**

Run: `node --test three-d/tests/layout.test.js`
Expected: FAIL because the module does not exist yet.

**Step 3: Write minimal implementation**

Create `three-d/src/layout.js` with a handcrafted city-block layout using stable asset IDs from the manifest.

**Step 4: Run test to verify it passes**

Run: `node --test three-d/tests/layout.test.js`
Expected: PASS

### Task 3: Build the 3D app shell

**Files:**
- Create: `three-d/index.html`
- Create: `three-d/styles.css`
- Create: `three-d/game.js`

**Step 1: Write the failing test**

Create a small smoke assertion in the layout or manifest tests if needed for startup metadata, or add a minimal Node test that checks the expected app entry files exist.

**Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL until the entry files exist.

**Step 3: Write minimal implementation**

Create the separate 3D page with:

- a single centered canvas container
- a start overlay
- HUD placeholders
- a `Back to Launcher` link

**Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS on file-presence/startup checks.

### Task 4: Implement Three.js scene loading and sync

**Files:**
- Create: `three-d/src/app.js`
- Create: `three-d/src/player.js`
- Create: `three-d/src/render-state.js`

**Step 1: Write the failing test**

Add a test for any pure helper used by the player or state text output, such as:

- movement vector normalization
- animation state selection
- text-state serialization

**Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL because helper modules or exports do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- Three.js renderer/scene/camera/lights
- GLTF asset loading and cloning
- scene population from layout data
- player movement
- follow camera
- animation mixer support
- `window.render_game_to_text`
- `window.advanceTime(ms)`

**Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS

### Task 5: Add the root launcher flow

**Files:**
- Modify: `index.html`
- Modify: `game.js`
- Modify: `styles.css`

**Step 1: Write the failing test**

Add a small pure launcher helper test if needed, or extend file-presence/startup tests to assert the launcher page includes both mode choices.

**Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL until the launcher markup/helper exists.

**Step 3: Write minimal implementation**

Update the root app so:

- the user first sees a launcher overlay
- choosing `2D` dynamically loads the existing 2D game
- choosing `3D` navigates to `three-d/index.html`

**Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS

### Task 6: Browser smoke verification

**Files:**
- Modify: `progress.md`

**Step 1: Start a static server**

Run: `python3 -m http.server 5184 --directory "/Users/adityagupta/Documents/Codex/Codex game test"`

**Step 2: Run launcher smoke check**

Run a Playwright client pass against the root launcher and capture screenshots/state.

**Step 3: Run 3D smoke check**

Run a Playwright client pass against `http://127.0.0.1:5184/three-d/index.html` with short move bursts and pauses.

**Step 4: Inspect artifacts**

Review:

- screenshots
- `state-*.json`
- `errors-*.json`

Fix the first issue found, then rerun until stable.

**Step 5: Record verification**

Append commands, artifact paths, and follow-up notes to `progress.md`.
