import { createThreeDApp } from "./src/app.js";

const startButton = document.getElementById("start-3d-btn");
const menuOverlay = document.getElementById("menu-overlay");
const statusLine = document.getElementById("status-line");
const hud = document.getElementById("hud");

let appPromise = null;

async function startPrototype() {
  if (appPromise) return;
  statusLine.textContent = "Loading assets and building the city block...";
  startButton.disabled = true;

  appPromise = createThreeDApp({
    sceneRoot: document.getElementById("scene-root"),
    canvas: document.getElementById("three-canvas"),
    hudMode: document.getElementById("hud-mode"),
    hudLocation: document.getElementById("hud-location"),
    hudSpeed: document.getElementById("hud-speed"),
    hudScene: document.getElementById("hud-scene"),
    onStatus(message) {
      statusLine.textContent = message;
    },
  });

  try {
    await appPromise;
    menuOverlay.classList.add("hidden");
    hud.classList.remove("hidden");
    statusLine.textContent = "Prototype active.";
  } catch (error) {
    console.error(error);
    startButton.disabled = false;
    appPromise = null;
    statusLine.textContent = "The 3D prototype failed to start. Check the console for details.";
  }
}

startButton.addEventListener("click", startPrototype);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuOverlay.classList.contains("hidden")) {
    window.location.assign("../index.html");
  }
});

const params = new URLSearchParams(window.location.search);
if (params.get("autostart") === "1") {
  requestAnimationFrame(() => {
    startPrototype().catch((error) => {
      console.error(error);
    });
  });
}

if (new URLSearchParams(window.location.search).get("autostart") === "1") {
  startPrototype();
}
