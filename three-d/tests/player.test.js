import test from "node:test";
import assert from "node:assert/strict";
import { deriveMotionState, normalizeInputVector } from "../src/player.js";

test("normalizeInputVector returns a unit-length diagonal intent", () => {
  const vector = normalizeInputVector({ x: 1, z: 1 });
  assert.ok(vector.x > 0);
  assert.ok(vector.z > 0);
  assert.ok(Math.abs(Math.hypot(vector.x, vector.z) - 1) < 0.0001);
});

test("deriveMotionState chooses idle, walk, and run based on speed", () => {
  assert.equal(deriveMotionState({ speed: 0.01, runHeld: false }), "idle");
  assert.equal(deriveMotionState({ speed: 1.5, runHeld: false }), "walk");
  assert.equal(deriveMotionState({ speed: 3.5, runHeld: true }), "run");
});
