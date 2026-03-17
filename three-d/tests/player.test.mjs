import test from "node:test";
import assert from "node:assert/strict";

import {
  computeIntentVector,
  selectCharacterClip,
  stepPlayerState,
} from "../src/player.mjs";

test("computeIntentVector normalizes diagonal input", () => {
  const vector = computeIntentVector({ forward: 1, right: 1 });

  assert.ok(Math.abs(vector.x - Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(vector.z + Math.SQRT1_2) < 1e-6);
});

test("selectCharacterClip prefers run, walk, and idle clips in order", () => {
  const clips = ["Idle", "Walk", "Run"];

  assert.equal(selectCharacterClip(clips, "idle"), "Idle");
  assert.equal(selectCharacterClip(clips, "walk"), "Walk");
  assert.equal(selectCharacterClip(clips, "run"), "Run");
});

test("stepPlayerState advances position and derives a movement state", () => {
  const next = stepPlayerState(
    {
      position: { x: 0, z: 0 },
      facing: 0,
      velocity: { x: 0, z: 0 },
      speed: 0,
      animationState: "idle",
    },
    { forward: 1, right: 0, sprint: true },
    1 / 60,
  );

  assert.notEqual(next.position.z, 0);
  assert.equal(next.animationState, "run");
  assert.ok(next.speed > 0);
});
