import test from "node:test";
import assert from "node:assert/strict";
import { ASSET_MANIFEST } from "../src/asset-manifest.js";

test("3D asset manifest provides required categories with GLB paths", () => {
  const requiredCategories = ["buildings", "roads", "vehicles", "guns", "characters"];

  for (const category of requiredCategories) {
    assert.ok(ASSET_MANIFEST[category], `missing category ${category}`);
    const entries = Object.values(ASSET_MANIFEST[category]);
    assert.ok(entries.length > 0, `expected assets in ${category}`);
    for (const asset of entries) {
      assert.equal(typeof asset.id, "string");
      assert.equal(typeof asset.path, "string");
      assert.match(asset.path, /\.glb$/);
    }
  }
});
