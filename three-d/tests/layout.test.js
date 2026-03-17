import test from "node:test";
import assert from "node:assert/strict";
import { createPrototypeLayout } from "../src/layout.js";

test("prototype layout returns a populated city block scene", () => {
  const layout = createPrototypeLayout();

  assert.ok(layout.spawnPoint);
  assert.ok(layout.roads.length > 0);
  assert.ok(layout.buildings.length > 0);
  assert.ok(layout.vehicles.length > 0);
  assert.ok(layout.characters.length > 0);
  assert.ok(layout.props.length > 0);
});
