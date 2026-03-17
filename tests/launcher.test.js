import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd());

test("root launcher markup exposes both 2D and 3D mode buttons", () => {
  const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  assert.match(html, /id="launch-2d-btn"/);
  assert.match(html, /id="launch-3d-btn"/);
});
