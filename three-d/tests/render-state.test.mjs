import test from "node:test";
import assert from "node:assert/strict";

import { createTextSnapshot } from "../src/render-state.mjs";

test("createTextSnapshot summarizes the active 3d scene state", () => {
  const snapshot = JSON.parse(
    createTextSnapshot({
      mode: "play",
      player: { position: { x: 12, y: 0, z: -8 }, speed: 4.2, animationState: "walk" },
      camera: { x: 5, y: 14, z: 16 },
      scene: {
        vehicles: [{ assetId: "policeCruiser" }, { assetId: "cityVan" }],
        characters: [{ assetId: "streetPunk", animationState: "idle" }],
        props: [{ assetId: "pistolPickup" }],
      },
    }),
  );

  assert.equal(snapshot.mode, "play");
  assert.equal(snapshot.player.animationState, "walk");
  assert.equal(snapshot.scene.vehicles, 2);
  assert.equal(snapshot.scene.characters, 1);
  assert.equal(snapshot.scene.props, 1);
  assert.match(snapshot.coordinateSystem, /x right/i);
});
