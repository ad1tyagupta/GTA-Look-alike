import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("launcher index exposes both 2D and 3D play options", () => {
  const html = readProjectFile("index.html");
  assert.match(html, /id="launcher-overlay"/);
  assert.match(html, /id="launch-2d-btn"/);
  assert.match(html, /id="launch-3d-btn"/);
});

test("launcher bootstrap dynamically loads the 2D app and links to the 3D app", () => {
  const source = readProjectFile("game.js");
  assert.match(source, /import\("\.\/src\/game-app\.js"\)/);
  assert.match(source, /\.\/three-d\/index\.html/);
});
