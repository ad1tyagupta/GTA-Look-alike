# Blacktop Dominion 3D Mode Design

**Date:** 2026-03-17

**Goal:** Add a separate 3D prototype of the game using the imported `GLB` assets while preserving the current 2D game as a stable version. The root app should become a launcher that lets the player choose either the current 2D game or the new 3D game.

## Constraints

- The current 2D game should remain playable and mostly untouched.
- The new 3D game should live in a separate folder and runtime.
- The start flow should offer a clear `2D` versus `3D` choice.
- The first 3D milestone is a basic playable prototype, not full feature parity.
- Only verified `GLB` assets should be used for the initial 3D build.

## Chosen Approach

Use a split-app structure:

- The root app remains the main entry point and becomes a launcher shell.
- Choosing `2D` dynamically loads the existing 2D game.
- Choosing `3D` navigates to a new app under `three-d/`.
- The 3D app is a separate Three.js-based experience built around a handcrafted city-block layout using the available assets.

This preserves the working 2D implementation and reduces the risk of regressions in the current game loop.

## 3D Prototype Scope

The first 3D build should include:

- A small city-block style map with roads and buildings.
- Parked vehicles placed around the roads.
- Animated characters placed in the scene.
- Gun props placed as world props.
- A controllable player character.
- A third-person follow camera.
- Basic movement and animation switching between idle, walk, and run where clips exist.
- A simple HUD/start overlay with controls and a back link to the launcher.

The first build will not aim for:

- Full mission parity with the 2D game.
- Police systems, combat systems, full vehicle driving, or save progression.
- Full procedural world parity with the authored 2D city.

## Architecture

### Root Launcher

- `index.html` gains a launcher overlay with `Play 2D` and `Play 3D`.
- `game.js` becomes a lightweight launcher bootstrap:
  - `Play 2D` dynamically imports the current `src/game-app.js` and starts the existing game.
  - `Play 3D` navigates to `three-d/index.html`.
- The existing start overlay remains the 2D game menu and is revealed only after choosing 2D mode.

### New 3D App

Create a new folder:

- `three-d/index.html`
- `three-d/styles.css`
- `three-d/game.js`
- `three-d/src/...`

The 3D app will be isolated from the 2D runtime and can evolve independently.

## 3D Runtime Modules

- `three-d/src/asset-manifest.js`
  - Stable IDs and file paths for buildings, roads, vehicles, guns, and character assets.
- `three-d/src/layout.js`
  - Pure layout data describing the scene arrangement for roads, buildings, parked vehicles, NPCs, and weapon props.
- `three-d/src/app.js`
  - Main setup for renderer, scene, camera, lighting, HUD hooks, animation loop, and gameplay state.
- `three-d/src/player.js`
  - Player movement, camera targeting, and animation selection.
- `three-d/src/render-state.js`
  - `render_game_to_text()` and `advanceTime(ms)` support for automation and smoke testing.

## Asset Usage Strategy

Use the current verified files:

- Buildings from `assets/3d/buildings/`
- Roads from `assets/3d/roads/`
- Vehicles from `assets/3d/vehicles/`
- Guns from `assets/3d/guns/`
- Animated characters from `assets/3d/characters/`

Ignore `Beach_Man.fbx` in the first pass.

Since filenames are inconsistent, the manifest will assign stable internal keys rather than relying on raw filenames throughout the code.

## Testing Strategy

Follow a test-first approach for the pure logic:

- Test the asset manifest shape and required categories.
- Test the generated 3D layout so the scene always has the expected map sections and entity counts.
- Test any pure player-state helpers used for movement/animation selection.

For browser verification:

- Run the 3D app through a local static server.
- Use the Playwright web-game client to:
  - open the launcher,
  - enter the 3D page,
  - start the prototype,
  - move the player,
  - capture screenshots,
  - inspect `render_game_to_text()` output,
  - review console errors.

## Expected Outcome

At the end of this milestone:

- Root launcher offers both 2D and 3D choices.
- The original 2D version still runs.
- The new 3D version loads a basic city scene from the imported assets and supports simple player exploration.
