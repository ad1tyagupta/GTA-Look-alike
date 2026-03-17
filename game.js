const launcherOverlay = document.getElementById("launcher-overlay");
const launcherNote = document.getElementById("launcher-note");
const launch2dButton = document.getElementById("launch-2d-btn");
const launch3dButton = document.getElementById("launch-3d-btn");
const startOverlay = document.getElementById("start-overlay");

let activeLaunch = null;

window.render_game_to_text = () => JSON.stringify({
  mode: activeLaunch || "launcher",
  options: ["2d", "3d"],
});

window.advanceTime = () => {};

async function load2DGame() {
  if (activeLaunch) return;
  activeLaunch = "2d";
  launch2dButton.disabled = true;
  launch3dButton.disabled = true;
  launcherNote.textContent = "Loading the current 2D operation...";
  launcherOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");

  try {
    const { initializeGame } = await import("./src/game-app.js");
    initializeGame();
  } catch (error) {
    console.error(error);
    activeLaunch = null;
    launch2dButton.disabled = false;
    launch3dButton.disabled = false;
    launcherOverlay.classList.remove("hidden");
    startOverlay.classList.add("hidden");
    launcherNote.textContent = "The 2D game failed to load. Check the console and try again.";
  }
}

function load3DGame() {
  if (activeLaunch) return;
  activeLaunch = "3d";
  window.location.assign("./three-d/index.html");
}

launch2dButton?.addEventListener("click", load2DGame);
launch3dButton?.addEventListener("click", load3DGame);
