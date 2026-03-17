import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appEntryPath = new URL("../src/app.js", import.meta.url);

test("3d browser app uses deploy-safe three.js module specifiers", async () => {
  const source = await readFile(appEntryPath, "utf8");

  assert.doesNotMatch(
    source,
    /node_modules\/three/i,
    "browser entry should not import from local node_modules paths",
  );
  assert.match(source, /from\s+"three"/, "browser entry should import three via the import map");
  assert.match(
    source,
    /from\s+"three\/addons\/loaders\/GLTFLoader\.js"/,
    "browser entry should import GLTFLoader via the import map",
  );
});
