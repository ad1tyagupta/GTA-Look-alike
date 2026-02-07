Original prompt: develop a GTA style game where the camera is on top. A player can roam in the city. It has real physics. Um, and there are cars on the road, police, people, everything. Like how the initial GTA games used to be.

## Progress
- Created initial web game scaffold (`index.html`, `styles.css`, `game.js`).
- Implemented top-down city map with roads/buildings and a camera-follow system.
- Added player movement on foot and entering/exiting vehicles.
- Added traffic cars, police AI behavior, pedestrians, and circle-based collision physics with impulses.
- Added wanted level + busted meter, HUD, fullscreen toggle (`F`), restart (`R`), pause (`P`).
- Added `window.render_game_to_text` and deterministic `window.advanceTime(ms)`.
- Made world simulation deterministic via seeded RNG for repeatable test behavior.
- Added a guaranteed nearby parked starter car so enter/drive/exit flows are consistently testable.
- Added scenario action payloads under `test-actions/` for on-foot roam, drive/exit, and longer police-pressure sequences.
- Executed Playwright skill-client runs and inspected all generated screenshots and state JSON artifacts.

## TODO
- Optional: tune wanted-level triggers to escalate faster during car crashes for more aggressive police chases.
- Optional: add combat, weapon pickups, and mission checkpoints to better match full classic-GTA gameplay loops.
- Optional: add richer NPC variety (buses/taxis, parked cars, gang/police pedestrian roles, ambient events).

## Test Runs
- `node --check game.js` passed.
- `node $WEB_GAME_CLIENT --url http://127.0.0.1:5173 --actions-file test-actions/on-foot-roam.json --iterations 2 --pause-ms 180 --screenshot-dir output/web-game/on-foot`
- `node $WEB_GAME_CLIENT --url http://127.0.0.1:5173 --actions-file test-actions/car-drive-exit.json --iterations 2 --pause-ms 180 --screenshot-dir output/web-game/car-drive`
- `node $WEB_GAME_CLIENT --url http://127.0.0.1:5173 --actions-file test-actions/police-pressure.json --iterations 2 --pause-ms 180 --screenshot-dir output/web-game/police-pressure`
- No `errors-*.json` files were produced in these runs (no captured console/page errors).
