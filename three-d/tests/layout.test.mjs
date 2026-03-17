import test from "node:test";
import assert from "node:assert/strict";

import { createPrototypeLayout } from "../src/layout.mjs";

test("prototype layout creates a playable city block with all required sections", () => {
  const layout = createPrototypeLayout();

  assert.ok(layout.world, "world config should exist");
  assert.equal(layout.world.width, 220);
  assert.equal(layout.world.depth, 220);
  assert.ok(layout.spawn, "player spawn should exist");
  assert.ok(layout.roads.length >= 4, "roads should be present");
  assert.ok(layout.buildings.length >= 6, "buildings should be present");
  assert.ok(layout.vehicles.length >= 4, "vehicles should be present");
  assert.ok(layout.characters.length >= 5, "characters should be present");
  assert.ok(layout.props.length >= 3, "props should be present");
});

test("prototype layout keeps all placed entities within world bounds", () => {
  const layout = createPrototypeLayout();
  const within = (x, z) =>
    x >= -layout.world.width * 0.5 &&
    x <= layout.world.width * 0.5 &&
    z >= -layout.world.depth * 0.5 &&
    z <= layout.world.depth * 0.5;

  for (const section of [layout.roads, layout.buildings, layout.vehicles, layout.characters, layout.props]) {
    for (const item of section) {
      assert.ok(within(item.position.x, item.position.z), `${item.assetId} is out of bounds`);
    }
  }
});
