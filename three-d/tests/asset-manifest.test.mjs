import test from "node:test";
import assert from "node:assert/strict";

import { getAssetManifest, getInitialSceneSelection } from "../src/asset-manifest.mjs";

test("asset manifest exposes required prototype categories with glb assets", () => {
  const manifest = getAssetManifest();

  for (const key of ["buildings", "roads", "vehicles", "guns", "characters"]) {
    assert.ok(manifest[key], `${key} category should exist`);
    assert.ok(Object.keys(manifest[key]).length > 0, `${key} should contain at least one asset`);
    for (const asset of Object.values(manifest[key])) {
      assert.match(asset.path, /\.glb$/i, `${key} asset path should point to a GLB file`);
      assert.ok(asset.label, `${key} assets should include a label`);
    }
  }
});

test("initial scene selection only references known manifest ids", () => {
  const manifest = getAssetManifest();
  const selection = getInitialSceneSelection();

  for (const id of selection.buildings) assert.ok(manifest.buildings[id], `unknown building id ${id}`);
  for (const id of selection.roads) assert.ok(manifest.roads[id], `unknown road id ${id}`);
  for (const id of selection.vehicles) assert.ok(manifest.vehicles[id], `unknown vehicle id ${id}`);
  for (const id of selection.guns) assert.ok(manifest.guns[id], `unknown gun id ${id}`);
  for (const id of selection.characters) assert.ok(manifest.characters[id], `unknown character id ${id}`);
});
