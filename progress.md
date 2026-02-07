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
- Expanded map size to `5400x3900` with denser road network and more traffic/pedestrians.
- Added shooting system (`Space`) with bullets, cooldown, muzzle flashes, and collision impacts against NPCs/cars/task targets.
- Changed car interaction key to `E`/`B` (on-foot and in-car), preserving `Space` for shooting.
- Added police-on-foot behavior: police officers can dismount from police cars and chase the player.
- Rebalanced movement so player on-foot speed and many traffic cars are faster than police pursuit units.
- Added mission system with chained tasks, marker guidance, and money rewards.
- Added health regeneration cooldown (regen after no damage + low activity idle period).
- Added minimap on bottom-right with player, police, mission marker, roads/buildings, and camera bounds.
- Added richer rendering pass (textured terrain/roads, crosswalks, detailed vehicles, styled pedestrians, varied building archetypes, environmental props, shadows/highlights).
- Updated HUD with money and active task text.

## TODO
- Add additional mission archetypes (escort, timed chase, cargo pickup).
- Improve AI pathfinding around dense building corners for police-on-foot.
- Add audio (engine loops, sirens, gunfire, mission complete stingers).
- Add save/load progression for money/task stage.

## Test Runs
- `node --check game.js` passed.
- Minimal harness check:
  - `node $WEB_GAME_CLIENT --url http://127.0.0.1:5177 --actions-json '{"steps":[{"buttons":["enter"],"frames":2},{"buttons":[],"frames":2}]}' --iterations 1 --pause-ms 80 --screenshot-dir output/web-game/smoke-lite`
- Scenario checks:
  - `node $WEB_GAME_CLIENT --url http://127.0.0.1:5177 --actions-file test-actions/on-foot-roam.json --iterations 1 --pause-ms 180 --screenshot-dir output/web-game/on-foot`
  - `node $WEB_GAME_CLIENT --url http://127.0.0.1:5177 --actions-file test-actions/car-drive-exit.json --iterations 1 --pause-ms 180 --screenshot-dir output/web-game/car-drive`
  - `node $WEB_GAME_CLIENT --url http://127.0.0.1:5177 --actions-file test-actions/police-pressure.json --iterations 1 --pause-ms 220 --screenshot-dir output/web-game/police-pressure`
- Additional mission movement validation:
  - `node $WEB_GAME_CLIENT --url http://127.0.0.1:5178 --actions-json '{"steps":[{"buttons":["enter"],"frames":2},{"buttons":["right"],"frames":70},{"buttons":["down"],"frames":74},{"buttons":[],"frames":20}]}' --iterations 1 --pause-ms 180 --screenshot-dir output/web-game/task-reach`
- Direct visual sanity check with Playwright screenshot:
  - `output/web-game/debug-current.png`
- No `errors-*.json` files were produced in current runs (no captured console/page errors).
