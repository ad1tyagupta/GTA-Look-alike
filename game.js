const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startOverlay = document.getElementById("start-overlay");
const startButton = document.getElementById("start-btn");
const hudMode = document.getElementById("hud-mode");
const hudHealth = document.getElementById("hud-health");
const hudWanted = document.getElementById("hud-wanted");
const hudSpeed = document.getElementById("hud-speed");
const hudMoney = document.getElementById("hud-money");
const hudTask = document.getElementById("hud-task");

const CONFIG = {
  worldWidth: 5400,
  worldHeight: 3900,
  fixedDt: 1 / 60,
  roadWidth: 160,
  playerAccel: 890,
  playerDrag: 5.6,
  playerMaxSpeed: 260,
  interactionRange: 64,
  bulletSpeed: 760,
  bulletLifetime: 1.2,
  shootCooldown: 0.16,
  healthRegenDelay: 4.4,
  healthRegenRate: 11,
};

const input = {
  keys: new Set(),
  pressed: new Set(),
};

let carIdCounter = 0;
let pedestrianIdCounter = 0;
let officerIdCounter = 0;
let bulletIdCounter = 0;
let targetIdCounter = 0;
let rngState = 1;

const BUILDING_STYLES = {
  tower: {
    wall: "#617286",
    trim: "#8fa9c6",
    roof: "#a3b6ca",
    window: "rgba(168, 219, 255, 0.58)",
  },
  apartment: {
    wall: "#8f887e",
    trim: "#c9c0b5",
    roof: "#b8b0a5",
    window: "rgba(237, 219, 176, 0.42)",
  },
  brick: {
    wall: "#7e6156",
    trim: "#a88a78",
    roof: "#9c796d",
    window: "rgba(235, 220, 180, 0.36)",
  },
  commercial: {
    wall: "#737f85",
    trim: "#b6c4cb",
    roof: "#a7b5bd",
    window: "rgba(177, 229, 248, 0.46)",
  },
  industrial: {
    wall: "#6a6a66",
    trim: "#9f9f99",
    roof: "#8c8c86",
    window: "rgba(201, 210, 214, 0.24)",
  },
};

const state = {
  mode: "menu",
  paused: false,
  time: 0,
  accumulator: 0,
  camera: {
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
  },
  wanted: 0,
  lastCrimeTime: -9999,
  bustedMeter: 0,
  collisionFlash: 0,
  money: 0,
  map: null,
  player: null,
  cars: [],
  peds: [],
  officers: [],
  bullets: [],
  muzzleFlashes: [],
  taskTargets: [],
  taskStage: 0,
  activeTask: null,
  nextTaskTimer: 0,
  missionToast: null,
  lastDamageTime: -9999,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function setSeed(seed) {
  rngState = (seed >>> 0) || 1;
}

function random() {
  rngState = (1664525 * rngState + 1013904223) >>> 0;
  return rngState / 4294967296;
}

function rand(min, max) {
  return min + random() * (max - min);
}

function randomChoice(list) {
  return list[Math.floor(random() * list.length)];
}

function normalizeAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function magnitude(x, y) {
  return Math.hypot(x, y);
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function isKeyDown(...codes) {
  return codes.some((code) => input.keys.has(code));
}

function consumePress(...codes) {
  for (const code of codes) {
    if (input.pressed.has(code)) {
      input.pressed.delete(code);
      return true;
    }
  }
  return false;
}

function getCarById(carId) {
  return state.cars.find((car) => car.id === carId) || null;
}

function getOfficerById(officerId) {
  return state.officers.find((officer) => officer.id === officerId) || null;
}

function getPlayerAnchor() {
  if (state.player.inCarId !== null) {
    const car = getCarById(state.player.inCarId);
    if (car) {
      return { x: car.x, y: car.y };
    }
  }
  return { x: state.player.x, y: state.player.y };
}

function getPlayerSpeed() {
  if (state.player.inCarId !== null) {
    const car = getCarById(state.player.inCarId);
    if (car) return Math.abs(car.forwardSpeed);
  }
  return magnitude(state.player.vx, state.player.vy);
}

function resizeCanvas() {
  const cssWidth = Math.max(860, Math.min(window.innerWidth, 1540));
  const cssHeight = Math.max(560, Math.min(window.innerHeight, 940));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth);
  canvas.height = Math.floor(cssHeight);
  state.camera.width = canvas.width;
  state.camera.height = canvas.height;
}

function createBuilding(rect) {
  const styleName = randomChoice(["tower", "apartment", "brick", "commercial", "industrial"]);
  const style = BUILDING_STYLES[styleName];
  const floors =
    styleName === "tower"
      ? Math.floor(rand(12, 26))
      : styleName === "industrial"
        ? Math.floor(rand(3, 7))
        : Math.floor(rand(5, 14));

  return {
    ...rect,
    type: styleName,
    style,
    floors,
    roofInset: rand(6, 14),
    windowStepX: rand(15, 23),
    windowStepY: rand(14, 22),
    hasAwning: styleName === "commercial" && random() < 0.75,
    awningColor: randomChoice(["#c84e4e", "#3b89c6", "#58a26f", "#cf953f"]),
  };
}

function buildBlockBuildings(left, right, top, bottom, buildings, props) {
  const blockW = right - left;
  const blockH = bottom - top;
  if (blockW < 170 || blockH < 170) return;

  const splitMode = blockW > 300 && blockH > 260 ? Math.floor(rand(0, 4)) : 0;
  const minSize = 110;

  const addBuildingRect = (x, y, w, h) => {
    if (w < minSize || h < minSize) return;
    const inset = rand(8, 22);
    const rect = {
      x: x + inset,
      y: y + inset,
      w: w - inset * 2,
      h: h - inset * 2,
    };
    if (rect.w < minSize || rect.h < minSize) return;
    buildings.push(createBuilding(rect));

    if (random() < 0.65) {
      props.push({
        type: "tree",
        x: rect.x - rand(10, 18),
        y: rect.y + rand(10, rect.h - 10),
        r: rand(10, 18),
      });
    }
    if (random() < 0.45) {
      props.push({
        type: "lamp",
        x: rect.x + rect.w + rand(8, 18),
        y: rect.y + rand(8, rect.h - 8),
        h: rand(18, 26),
      });
    }
  };

  if (splitMode === 1) {
    const splitX = left + blockW * rand(0.4, 0.6);
    addBuildingRect(left, top, splitX - left, blockH);
    addBuildingRect(splitX, top, right - splitX, blockH);
  } else if (splitMode === 2) {
    const splitY = top + blockH * rand(0.38, 0.62);
    addBuildingRect(left, top, blockW, splitY - top);
    addBuildingRect(left, splitY, blockW, bottom - splitY);
  } else if (splitMode === 3) {
    const splitX = left + blockW * rand(0.38, 0.62);
    const splitY = top + blockH * rand(0.35, 0.65);
    addBuildingRect(left, top, splitX - left, splitY - top);
    addBuildingRect(splitX, top, right - splitX, splitY - top);
    addBuildingRect(left, splitY, splitX - left, bottom - splitY);
    addBuildingRect(splitX, splitY, right - splitX, bottom - splitY);
  } else {
    addBuildingRect(left, top, blockW, blockH);
  }
}

function createCityMap() {
  const roads = [];
  const buildings = [];
  const sidewalkNodes = [];
  const carPaths = [];
  const props = [];
  const missionPoints = [];
  const crosswalks = [];

  const roadW = CONFIG.roadWidth;
  const vRoadCenters = [420, 980, 1540, 2100, 2660, 3220, 3780, 4340, 4900];
  const hRoadCenters = [340, 940, 1540, 2140, 2740, 3340];

  for (const x of vRoadCenters) {
    roads.push({
      x: x - roadW * 0.5,
      y: 0,
      w: roadW,
      h: CONFIG.worldHeight,
      orientation: "vertical",
    });
  }

  for (const y of hRoadCenters) {
    roads.push({
      x: 0,
      y: y - roadW * 0.5,
      w: CONFIG.worldWidth,
      h: roadW,
      orientation: "horizontal",
    });
  }

  for (let ix = 0; ix < vRoadCenters.length - 1; ix += 1) {
    for (let iy = 0; iy < hRoadCenters.length - 1; iy += 1) {
      const left = vRoadCenters[ix] + roadW * 0.5 + 34;
      const right = vRoadCenters[ix + 1] - roadW * 0.5 - 34;
      const top = hRoadCenters[iy] + roadW * 0.5 + 34;
      const bottom = hRoadCenters[iy + 1] - roadW * 0.5 - 34;
      buildBlockBuildings(left, right, top, bottom, buildings, props);
    }
  }

  for (const vx of vRoadCenters) {
    for (const hy of hRoadCenters) {
      const offset = roadW * 0.5 + 28;
      sidewalkNodes.push({ x: vx - offset, y: hy - offset });
      sidewalkNodes.push({ x: vx + offset, y: hy - offset });
      sidewalkNodes.push({ x: vx + offset, y: hy + offset });
      sidewalkNodes.push({ x: vx - offset, y: hy + offset });

      crosswalks.push({
        x: vx - roadW * 0.62,
        y: hy - roadW * 0.5 - 12,
        w: roadW * 1.24,
        h: 24,
        orientation: "horizontal",
      });
      crosswalks.push({
        x: vx - 12,
        y: hy - roadW * 0.62,
        w: 24,
        h: roadW * 1.24,
        orientation: "vertical",
      });

      if ((ixHash(vx) + iyHash(hy)) % 2 === 0) {
        missionPoints.push({ x: vx + rand(-150, 150), y: hy + rand(-150, 150) });
      }
    }
  }

  const laneOffset = roadW * 0.28;
  for (const y of hRoadCenters) {
    carPaths.push([
      { x: 140, y: y - laneOffset },
      { x: CONFIG.worldWidth - 140, y: y - laneOffset },
      { x: CONFIG.worldWidth - 140, y: y + laneOffset },
      { x: 140, y: y + laneOffset },
    ]);
    carPaths.push([
      { x: CONFIG.worldWidth - 140, y: y + laneOffset },
      { x: 140, y: y + laneOffset },
      { x: 140, y: y - laneOffset },
      { x: CONFIG.worldWidth - 140, y: y - laneOffset },
    ]);
  }

  for (const x of vRoadCenters) {
    carPaths.push([
      { x: x - laneOffset, y: 140 },
      { x: x - laneOffset, y: CONFIG.worldHeight - 140 },
      { x: x + laneOffset, y: CONFIG.worldHeight - 140 },
      { x: x + laneOffset, y: 140 },
    ]);
    carPaths.push([
      { x: x + laneOffset, y: CONFIG.worldHeight - 140 },
      { x: x + laneOffset, y: 140 },
      { x: x - laneOffset, y: 140 },
      { x: x - laneOffset, y: CONFIG.worldHeight - 140 },
    ]);
  }

  missionPoints.push({ x: 540, y: 500 });
  missionPoints.push({ x: CONFIG.worldWidth - 640, y: 620 });
  missionPoints.push({ x: CONFIG.worldWidth - 800, y: CONFIG.worldHeight - 720 });
  missionPoints.push({ x: 820, y: CONFIG.worldHeight - 740 });

  return {
    roads,
    buildings,
    sidewalkNodes,
    carPaths,
    props,
    missionPoints,
    crosswalks,
    vRoadCenters,
    hRoadCenters,
  };
}

function ixHash(value) {
  return Math.floor(value * 0.031);
}

function iyHash(value) {
  return Math.floor(value * 0.017);
}

function makeVehicle(type, path, segment, t, color) {
  const a = path[segment % path.length];
  const b = path[(segment + 1) % path.length];
  const x = lerp(a.x, b.x, t);
  const y = lerp(a.y, b.y, t);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const police = type === "police";
  const model = randomChoice(["sedan", "coupe", "hatch"]);
  const baseLength = model === "coupe" ? 58 : model === "hatch" ? 55 : 64;
  const baseWidth = model === "hatch" ? 30 : 33;

  return {
    id: ++carIdCounter,
    type,
    model,
    x,
    y,
    vx: 0,
    vy: 0,
    r: police ? 23 : 21,
    mass: police ? 1880 : 1600,
    angle,
    width: police ? baseWidth + 3 : baseWidth,
    length: police ? baseLength + 5 : baseLength,
    color,
    path,
    pathIndex: (segment + 1) % path.length,
    cruiseSpeed: police ? rand(105, 150) : rand(115, 185),
    engineAccel: police ? 610 : 700,
    brakePower: police ? 920 : 900,
    steerPower: police ? 2.3 : 2.5,
    maxForward: police ? rand(220, 248) : rand(285, 322),
    maxReverse: police ? 110 : 120,
    grip: police ? 8.8 : 8.4,
    forwardSpeed: 0,
    sirenPhase: rand(0, Math.PI * 2),
    parked: false,
    officerReady: police,
    deployedOfficerId: null,
  };
}

function makePedestrian(x, y) {
  return {
    id: ++pedestrianIdCounter,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 9,
    mass: 82,
    maxSpeed: rand(34, 58),
    targetNode: Math.floor(random() * state.map.sidewalkNodes.length),
    panic: 0,
    stunned: 0,
    legPhase: rand(0, Math.PI * 2),
    shirtColor: randomChoice(["#447ec5", "#5aa273", "#bf5f5f", "#8271c5", "#d59d4f"]),
    skinColor: randomChoice(["#f1d4b0", "#d7b089", "#b88963", "#efd2c2"]),
  };
}

function makeOfficer(x, y, carId) {
  return {
    id: ++officerIdCounter,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 10,
    mass: 88,
    maxSpeed: 212,
    accel: 860,
    hp: 100,
    stunned: 0,
    carId,
    legPhase: rand(0, Math.PI * 2),
  };
}

function resetWorld(startPlaying) {
  setSeed(20260208);
  carIdCounter = 0;
  pedestrianIdCounter = 0;
  officerIdCounter = 0;
  bulletIdCounter = 0;
  targetIdCounter = 0;

  state.time = 0;
  state.accumulator = 0;
  state.wanted = 0;
  state.lastCrimeTime = -9999;
  state.bustedMeter = 0;
  state.collisionFlash = 0;
  state.money = 0;
  state.lastDamageTime = -9999;

  state.map = createCityMap();
  state.cars = [];
  state.peds = [];
  state.officers = [];
  state.bullets = [];
  state.muzzleFlashes = [];
  state.taskTargets = [];
  state.taskStage = 0;
  state.nextTaskTimer = 0;
  state.missionToast = null;

  state.player = {
    x: 620,
    y: 500,
    vx: 0,
    vy: 0,
    r: 13,
    mass: 85,
    facing: 0,
    health: 100,
    inCarId: null,
    nextShotAt: 0,
    lastShotTime: -9999,
  };

  const carColors = [
    "#d84848",
    "#e4b94f",
    "#4f8fd8",
    "#54b56e",
    "#d18f56",
    "#a86fc2",
    "#48bcb6",
    "#df7848",
  ];

  for (let i = 0; i < 40; i += 1) {
    const path = state.map.carPaths[i % state.map.carPaths.length];
    const segment = Math.floor(random() * path.length);
    const t = random();
    state.cars.push(makeVehicle("traffic", path, segment, t, carColors[i % carColors.length]));
  }

  for (let i = 0; i < 10; i += 1) {
    const path = state.map.carPaths[(i + 7) % state.map.carPaths.length];
    const segment = Math.floor(random() * path.length);
    const t = random();
    state.cars.push(makeVehicle("police", path, segment, t, "#f0f1f2"));
  }

  const starterCar = makeVehicle("traffic", state.map.carPaths[0], 0, 0.1, "#f08b3e");
  starterCar.x = state.player.x + 36;
  starterCar.y = state.player.y + 64;
  starterCar.angle = -Math.PI * 0.5;
  starterCar.vx = 0;
  starterCar.vy = 0;
  starterCar.forwardSpeed = 0;
  starterCar.parked = true;
  state.cars.push(starterCar);

  for (let i = 0; i < 110; i += 1) {
    const node = randomChoice(state.map.sidewalkNodes);
    state.peds.push(makePedestrian(node.x + rand(-18, 18), node.y + rand(-18, 18)));
  }

  state.mode = startPlaying ? "playing" : "menu";
  state.paused = false;
  state.activeTask = null;
  assignNextTask(true);

  if (startPlaying) {
    startOverlay.classList.add("hidden");
  } else {
    startOverlay.classList.remove("hidden");
  }

  updateCamera(0);
  updateHud();
}

function addWanted(amount) {
  state.wanted = clamp(state.wanted + amount, 0, 5);
  state.lastCrimeTime = state.time;
}

function damagePlayer(amount) {
  if (amount <= 0) return;
  state.player.health = clamp(state.player.health - amount, 0, 100);
  state.lastDamageTime = state.time;
}

function spawnTaskTargets(center, count) {
  state.taskTargets = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + rand(-0.25, 0.25);
    const distance = rand(52, 130);
    state.taskTargets.push({
      id: ++targetIdCounter,
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance,
      r: 15,
      hp: 3,
      maxHp: 3,
    });
  }
}

function assignNextTask(initial = false) {
  const stage = state.taskStage;
  const cycle = stage % 3;
  const round = Math.floor(stage / 3);
  const pointA = state.map.missionPoints[(stage * 2 + 1) % state.map.missionPoints.length];
  const pointB = state.map.missionPoints[(stage * 3 + 4) % state.map.missionPoints.length];

  if (cycle === 0) {
    state.taskTargets = [];
    state.activeTask = {
      type: "reach",
      title: "Meet Your Contact",
      description: "Get to the marker.",
      waypoint: { x: pointA.x, y: pointA.y },
      radius: 95,
      reward: 150 + round * 35,
    };
  } else if (cycle === 1) {
    const center = { x: pointB.x, y: pointB.y };
    const targetCount = 3 + (round % 2);
    spawnTaskTargets(center, targetCount);
    state.activeTask = {
      type: "shoot",
      title: "Destroy Gang Stash",
      description: "Shoot all marked crates.",
      waypoint: center,
      radius: 170,
      reward: 220 + round * 45,
      targetCount,
    };
  } else {
    state.taskTargets = [];
    state.activeTask = {
      type: "drive",
      title: "Deliver Hot Ride",
      description: "Reach marker while in a car.",
      waypoint: { x: pointA.x, y: pointB.y },
      radius: 120,
      reward: 300 + round * 55,
    };
  }

  if (!initial) {
    state.missionToast = {
      text: `NEW TASK: ${state.activeTask.title}`,
      ttl: 2.6,
    };
  }
}

function completeTask() {
  if (!state.activeTask) return;
  const reward = state.activeTask.reward;
  state.money += reward;
  state.taskStage += 1;
  state.activeTask = null;
  state.nextTaskTimer = 2.2;
  state.taskTargets = [];
  state.missionToast = {
    text: `TASK COMPLETE +$${reward}`,
    ttl: 2.8,
  };
}

function updateTasks(dt) {
  if (state.activeTask) {
    if (state.activeTask.type === "reach") {
      const dx = state.player.x - state.activeTask.waypoint.x;
      const dy = state.player.y - state.activeTask.waypoint.y;
      if (Math.hypot(dx, dy) <= state.activeTask.radius) completeTask();
    } else if (state.activeTask.type === "shoot") {
      state.taskTargets = state.taskTargets.filter((target) => target.hp > 0);
      if (state.taskTargets.length === 0) completeTask();
    } else if (state.activeTask.type === "drive") {
      if (state.player.inCarId !== null) {
        const anchor = getPlayerAnchor();
        const dx = anchor.x - state.activeTask.waypoint.x;
        const dy = anchor.y - state.activeTask.waypoint.y;
        if (Math.hypot(dx, dy) <= state.activeTask.radius) completeTask();
      }
    }
  } else {
    state.nextTaskTimer -= dt;
    if (state.nextTaskTimer <= 0) {
      assignNextTask(false);
    }
  }
}

function fireBullet(x, y, angle, inheritedVX, inheritedVY) {
  if (state.time < state.player.nextShotAt) return false;
  state.player.nextShotAt = state.time + CONFIG.shootCooldown;
  state.player.lastShotTime = state.time;
  const spread = rand(-0.035, 0.035);
  const heading = angle + spread;
  const vx = Math.cos(heading) * CONFIG.bulletSpeed + inheritedVX * 0.3;
  const vy = Math.sin(heading) * CONFIG.bulletSpeed + inheritedVY * 0.3;

  state.bullets.push({
    id: ++bulletIdCounter,
    x,
    y,
    prevX: x,
    prevY: y,
    vx,
    vy,
    r: 3,
    life: CONFIG.bulletLifetime,
    damage: 38,
  });

  state.muzzleFlashes.push({
    x,
    y,
    ttl: 0.08,
  });

  addWanted(0.05);
  return true;
}

function updateVehicle(car, dt, control) {
  const throttle = clamp(control.throttle ?? 0, -1, 1);
  const brake = clamp(control.brake ?? 0, 0, 1);
  const steer = clamp(control.steer ?? 0, -1, 1);

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const sx = -fy;
  const sy = fx;

  let forward = car.vx * fx + car.vy * fy;
  let lateral = car.vx * sx + car.vy * sy;

  const accel = throttle >= 0 ? throttle * car.engineAccel : throttle * car.engineAccel * 0.65;
  forward += accel * dt;

  const brakeStep = (220 + car.brakePower * brake) * dt;
  if (Math.abs(forward) <= brakeStep) {
    forward = 0;
  } else {
    forward -= Math.sign(forward) * brakeStep;
  }

  forward *= Math.exp(-1.3 * dt);
  forward = clamp(forward, -car.maxReverse, car.maxForward);

  lateral *= 1 - clamp(car.grip * dt, 0, 1);
  const steerScale = clamp(Math.abs(forward) / 170, 0.22, 1.45);
  car.angle += steer * car.steerPower * steerScale * dt * (forward >= 0 ? 1 : -1);

  car.vx = fx * forward + sx * lateral;
  car.vy = fy * forward + sy * lateral;

  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.forwardSpeed = forward;
  car.sirenPhase += dt * 8;

  if (car.x < car.r) {
    car.x = car.r;
    car.vx = Math.abs(car.vx) * 0.2;
    car.forwardSpeed *= 0.4;
  }
  if (car.x > CONFIG.worldWidth - car.r) {
    car.x = CONFIG.worldWidth - car.r;
    car.vx = -Math.abs(car.vx) * 0.2;
    car.forwardSpeed *= 0.4;
  }
  if (car.y < car.r) {
    car.y = car.r;
    car.vy = Math.abs(car.vy) * 0.2;
    car.forwardSpeed *= 0.4;
  }
  if (car.y > CONFIG.worldHeight - car.r) {
    car.y = CONFIG.worldHeight - car.r;
    car.vy = -Math.abs(car.vy) * 0.2;
    car.forwardSpeed *= 0.4;
  }
}

function detectObstacleAhead(car, lookAhead) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let closest = Infinity;
  for (const other of state.cars) {
    if (other.id === car.id) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const projection = dx * fx + dy * fy;
    if (projection <= 0 || projection > lookAhead) continue;
    const side = Math.abs(dx * -fy + dy * fx);
    if (side < car.width + 2) {
      closest = Math.min(closest, projection);
    }
  }
  return closest;
}

function driveTowardTarget(car, targetX, targetY, speedBias = 1) {
  const dx = targetX - car.x;
  const dy = targetY - car.y;
  const distance = Math.hypot(dx, dy);
  const targetAngle = Math.atan2(dy, dx);
  const angleError = normalizeAngle(targetAngle - car.angle);
  const steer = clamp(angleError * 1.85, -1, 1);
  const turnPenalty = clamp(Math.abs(angleError) / Math.PI, 0, 0.74);
  const targetSpeed = car.cruiseSpeed * speedBias * (1 - turnPenalty);
  const currentSpeed = car.forwardSpeed;
  let throttle = currentSpeed < targetSpeed - 8 ? 1 : -0.2;
  let brake = currentSpeed > targetSpeed + 26 ? 1 : 0;

  const obstacle = detectObstacleAhead(car, 95);
  if (obstacle < Infinity) {
    if (obstacle < 44) {
      throttle = -0.9;
      brake = 1;
    } else if (obstacle < 78) {
      throttle = -0.4;
      brake = 0.7;
    }
  }
  return { throttle, brake, steer, distance };
}

function computeTrafficControl(car) {
  const target = car.path[car.pathIndex];
  const control = driveTowardTarget(car, target.x, target.y, 1);
  if (control.distance < 38) {
    car.pathIndex = (car.pathIndex + 1) % car.path.length;
  }
  return control;
}

function deployOfficerFromCar(car) {
  if (!car.officerReady || car.deployedOfficerId !== null) return;
  const side = random() < 0.5 ? -1 : 1;
  const offset = car.r + 14;
  const x = car.x + Math.cos(car.angle + side * Math.PI * 0.5) * offset;
  const y = car.y + Math.sin(car.angle + side * Math.PI * 0.5) * offset;
  const officer = makeOfficer(x, y, car.id);
  officer.vx = car.vx * 0.2;
  officer.vy = car.vy * 0.2;
  state.officers.push(officer);
  car.officerReady = false;
  car.deployedOfficerId = officer.id;
}

function computePoliceControl(car) {
  if (car.deployedOfficerId !== null) {
    const officer = getOfficerById(car.deployedOfficerId);
    if (!officer) {
      car.deployedOfficerId = null;
    } else {
      const holdControl = driveTowardTarget(car, officer.x, officer.y, 0.55);
      holdControl.brake = Math.max(holdControl.brake, 0.7);
      holdControl.throttle = Math.min(holdControl.throttle, 0.25);
      return holdControl;
    }
  }

  if (state.wanted > 0.2) {
    const anchor = getPlayerAnchor();
    const control = driveTowardTarget(car, anchor.x, anchor.y, 0.98);
    if (control.distance < 260 && car.officerReady && state.wanted > 0.5) {
      deployOfficerFromCar(car);
    }
    if (control.distance < 125) {
      control.brake = Math.max(control.brake, 0.68);
      control.throttle = Math.min(control.throttle, 0.24);
    }
    return control;
  }

  const defaultControl = computeTrafficControl(car);
  defaultControl.throttle = Math.max(defaultControl.throttle, 0.3);
  return defaultControl;
}

function resolveCircleVsRect(body, rect) {
  const closestX = clamp(body.x, rect.x, rect.x + rect.w);
  const closestY = clamp(body.y, rect.y, rect.y + rect.h);
  let dx = body.x - closestX;
  let dy = body.y - closestY;
  let distance = Math.hypot(dx, dy);
  if (distance >= body.r) return false;

  if (distance < 0.0001) {
    const fromLeft = Math.abs(body.x - rect.x);
    const fromRight = Math.abs(body.x - (rect.x + rect.w));
    const fromTop = Math.abs(body.y - rect.y);
    const fromBottom = Math.abs(body.y - (rect.y + rect.h));
    const minEdge = Math.min(fromLeft, fromRight, fromTop, fromBottom);
    if (minEdge === fromLeft) {
      dx = -1;
      dy = 0;
    } else if (minEdge === fromRight) {
      dx = 1;
      dy = 0;
    } else if (minEdge === fromTop) {
      dx = 0;
      dy = -1;
    } else {
      dx = 0;
      dy = 1;
    }
    distance = 1;
  } else {
    dx /= distance;
    dy /= distance;
  }

  const penetration = body.r - distance;
  body.x += dx * penetration;
  body.y += dy * penetration;

  if (typeof body.vx === "number" && typeof body.vy === "number") {
    const speedIntoSurface = body.vx * dx + body.vy * dy;
    if (speedIntoSurface < 0) {
      body.vx -= speedIntoSurface * dx;
      body.vy -= speedIntoSurface * dy;
    }
  }
  return true;
}

function resolveCircleVsBuildings(body) {
  for (const building of state.map.buildings) {
    const hit = resolveCircleVsRect(body, building);
    if (hit && body.forwardSpeed !== undefined) {
      body.forwardSpeed *= 0.35;
    }
  }
}

function resolveDynamicCircle(a, b, restitution) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.r + b.r;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return 0;

  let dist = Math.sqrt(distSq);
  let nx = 1;
  let ny = 0;
  if (dist > 0.0001) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    dist = minDist;
  }

  const invMassA = 1 / Math.max(1, a.mass);
  const invMassB = 1 / Math.max(1, b.mass);
  const separation = (minDist - dist) * 0.96;
  const sumInvMass = invMassA + invMassB;
  a.x -= nx * (separation * invMassA / sumInvMass);
  a.y -= ny * (separation * invMassA / sumInvMass);
  b.x += nx * (separation * invMassB / sumInvMass);
  b.y += ny * (separation * invMassB / sumInvMass);

  const rvx = (b.vx ?? 0) - (a.vx ?? 0);
  const rvy = (b.vy ?? 0) - (a.vy ?? 0);
  const velocityAlongNormal = rvx * nx + rvy * ny;
  if (velocityAlongNormal >= 0) return 0;

  const j = (-(1 + restitution) * velocityAlongNormal) / sumInvMass;
  const impulseX = j * nx;
  const impulseY = j * ny;
  if (typeof a.vx === "number") a.vx -= impulseX * invMassA;
  if (typeof a.vy === "number") a.vy -= impulseY * invMassA;
  if (typeof b.vx === "number") b.vx += impulseX * invMassB;
  if (typeof b.vy === "number") b.vy += impulseY * invMassB;
  return -velocityAlongNormal;
}

function updatePlayerOnFoot(dt) {
  const moveX = (isKeyDown("ArrowRight", "KeyD") ? 1 : 0) - (isKeyDown("ArrowLeft", "KeyA") ? 1 : 0);
  const moveY = (isKeyDown("ArrowDown", "KeyS") ? 1 : 0) - (isKeyDown("ArrowUp", "KeyW") ? 1 : 0);
  const length = Math.hypot(moveX, moveY) || 1;
  const normX = moveX / length;
  const normY = moveY / length;

  state.player.vx += normX * CONFIG.playerAccel * dt;
  state.player.vy += normY * CONFIG.playerAccel * dt;
  state.player.vx *= Math.exp(-CONFIG.playerDrag * dt);
  state.player.vy *= Math.exp(-CONFIG.playerDrag * dt);

  const speed = magnitude(state.player.vx, state.player.vy);
  if (speed > CONFIG.playerMaxSpeed) {
    const ratio = CONFIG.playerMaxSpeed / speed;
    state.player.vx *= ratio;
    state.player.vy *= ratio;
  }

  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;
  state.player.x = clamp(state.player.x, state.player.r, CONFIG.worldWidth - state.player.r);
  state.player.y = clamp(state.player.y, state.player.r, CONFIG.worldHeight - state.player.r);

  resolveCircleVsBuildings(state.player);

  if (speed > 8) {
    state.player.facing = Math.atan2(state.player.vy, state.player.vx);
  }

  if (consumePress("Space")) {
    fireBullet(
      state.player.x + Math.cos(state.player.facing) * 16,
      state.player.y + Math.sin(state.player.facing) * 16,
      state.player.facing,
      state.player.vx,
      state.player.vy
    );
  }

  if (consumePress("KeyE", "KeyB")) {
    enterNearestCar();
  }
}

function updatePlayerInCar(dt) {
  const car = getCarById(state.player.inCarId);
  if (!car) {
    state.player.inCarId = null;
    return;
  }

  const throttle = (isKeyDown("ArrowUp", "KeyW") ? 1 : 0) - (isKeyDown("ArrowDown", "KeyS") ? 1 : 0);
  const steer = (isKeyDown("ArrowRight", "KeyD") ? 1 : 0) - (isKeyDown("ArrowLeft", "KeyA") ? 1 : 0);
  updateVehicle(car, dt, { throttle, steer, brake: 0 });

  state.player.x = car.x;
  state.player.y = car.y;
  state.player.vx = car.vx;
  state.player.vy = car.vy;
  state.player.facing = car.angle;

  if (consumePress("Space")) {
    fireBullet(
      car.x + Math.cos(car.angle) * (car.length * 0.5 + 6),
      car.y + Math.sin(car.angle) * (car.length * 0.5 + 6),
      car.angle,
      car.vx,
      car.vy
    );
  }

  if (consumePress("KeyE", "KeyB") && Math.abs(car.forwardSpeed) < 42) {
    exitCurrentCar(car);
  }
}

function enterNearestCar() {
  let nearest = null;
  let minDist = CONFIG.interactionRange;
  for (const car of state.cars) {
    const dx = car.x - state.player.x;
    const dy = car.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < minDist) {
      minDist = distance;
      nearest = car;
    }
  }
  if (!nearest) return;

  if (nearest.type === "police") {
    addWanted(0.7);
  }

  state.player.inCarId = nearest.id;
  state.player.x = nearest.x;
  state.player.y = nearest.y;
  state.player.vx = nearest.vx;
  state.player.vy = nearest.vy;
  state.player.facing = nearest.angle;
  nearest.parked = false;
}

function exitCurrentCar(car) {
  const side = Math.sign(Math.sin(state.time * 2.4)) || 1;
  const offsetX = Math.cos(car.angle + side * Math.PI * 0.5) * (car.r + state.player.r + 10);
  const offsetY = Math.sin(car.angle + side * Math.PI * 0.5) * (car.r + state.player.r + 10);
  const candidate = {
    x: clamp(car.x + offsetX, state.player.r, CONFIG.worldWidth - state.player.r),
    y: clamp(car.y + offsetY, state.player.r, CONFIG.worldHeight - state.player.r),
    vx: car.vx * 0.35,
    vy: car.vy * 0.35,
    r: state.player.r,
  };

  resolveCircleVsBuildings(candidate);
  state.player.inCarId = null;
  state.player.x = candidate.x;
  state.player.y = candidate.y;
  state.player.vx = candidate.vx;
  state.player.vy = candidate.vy;
}

function updatePedestrians(dt) {
  const nodes = state.map.sidewalkNodes;
  for (const ped of state.peds) {
    if (ped.stunned > 0) {
      ped.stunned = Math.max(0, ped.stunned - dt);
      ped.vx *= Math.exp(-4.8 * dt);
      ped.vy *= Math.exp(-4.8 * dt);
    } else {
      const target = nodes[ped.targetNode];
      let dx = target.x - ped.x;
      let dy = target.y - ped.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 20) {
        ped.targetNode = Math.floor(random() * nodes.length);
        dx = 0;
        dy = 0;
      } else {
        dx /= dist;
        dy /= dist;
      }

      const panicBoost = ped.panic > 0 ? 58 : 0;
      const accel = 185;
      ped.vx += dx * accel * dt;
      ped.vy += dy * accel * dt;
      ped.vx *= Math.exp(-3.7 * dt);
      ped.vy *= Math.exp(-3.7 * dt);

      const maxSpeed = ped.maxSpeed + panicBoost;
      const speed = Math.hypot(ped.vx, ped.vy);
      if (speed > maxSpeed) {
        const ratio = maxSpeed / speed;
        ped.vx *= ratio;
        ped.vy *= ratio;
      }

      ped.panic = Math.max(0, ped.panic - dt);
    }

    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;
    ped.x = clamp(ped.x, ped.r, CONFIG.worldWidth - ped.r);
    ped.y = clamp(ped.y, ped.r, CONFIG.worldHeight - ped.r);
    ped.legPhase += dt * (5 + magnitude(ped.vx, ped.vy) * 0.06);

    resolveCircleVsBuildings(ped);
  }
}

function updateOfficers(dt) {
  const anchor = getPlayerAnchor();
  for (let i = state.officers.length - 1; i >= 0; i -= 1) {
    const officer = state.officers[i];

    if (officer.hp <= 0) {
      const car = getCarById(officer.carId);
      if (car) car.deployedOfficerId = null;
      state.officers.splice(i, 1);
      continue;
    }

    if (officer.stunned > 0) {
      officer.stunned = Math.max(0, officer.stunned - dt);
      officer.vx *= Math.exp(-5 * dt);
      officer.vy *= Math.exp(-5 * dt);
    } else {
      let targetX = anchor.x;
      let targetY = anchor.y;
      if (state.wanted < 0.18) {
        const homeCar = getCarById(officer.carId);
        if (homeCar) {
          targetX = homeCar.x;
          targetY = homeCar.y;
        }
      }

      let dx = targetX - officer.x;
      let dy = targetY - officer.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;

      officer.vx += dx * officer.accel * dt;
      officer.vy += dy * officer.accel * dt;
      officer.vx *= Math.exp(-4.9 * dt);
      officer.vy *= Math.exp(-4.9 * dt);

      const maxSpeed = officer.maxSpeed;
      const speed = Math.hypot(officer.vx, officer.vy);
      if (speed > maxSpeed) {
        const ratio = maxSpeed / speed;
        officer.vx *= ratio;
        officer.vy *= ratio;
      }
    }

    officer.x += officer.vx * dt;
    officer.y += officer.vy * dt;
    officer.x = clamp(officer.x, officer.r, CONFIG.worldWidth - officer.r);
    officer.y = clamp(officer.y, officer.r, CONFIG.worldHeight - officer.r);
    officer.legPhase += dt * (6 + magnitude(officer.vx, officer.vy) * 0.06);

    resolveCircleVsBuildings(officer);

    const distToPlayer = Math.hypot(officer.x - state.player.x, officer.y - state.player.y);
    if (distToPlayer < 32) {
      state.bustedMeter = clamp(state.bustedMeter + dt * 0.34, 0, 1);
      if (state.player.inCarId === null) {
        damagePlayer(8 * dt);
      }
    }
  }
}

function updateBullets(dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.prevX = bullet.x;
    bullet.prevY = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (
      bullet.life <= 0 ||
      bullet.x < -20 ||
      bullet.y < -20 ||
      bullet.x > CONFIG.worldWidth + 20 ||
      bullet.y > CONFIG.worldHeight + 20
    ) {
      state.bullets.splice(i, 1);
      continue;
    }

    let consumed = false;

    for (const building of state.map.buildings) {
      if (pointInRect(bullet.x, bullet.y, building)) {
        consumed = true;
        break;
      }
    }

    if (!consumed) {
      for (const target of state.taskTargets) {
        const dx = target.x - bullet.x;
        const dy = target.y - bullet.y;
        if (dx * dx + dy * dy <= (target.r + bullet.r) * (target.r + bullet.r)) {
          target.hp -= 1;
          consumed = true;
          break;
        }
      }
    }

    if (!consumed) {
      for (const officer of state.officers) {
        const dx = officer.x - bullet.x;
        const dy = officer.y - bullet.y;
        if (dx * dx + dy * dy <= (officer.r + bullet.r) * (officer.r + bullet.r)) {
          officer.hp -= bullet.damage;
          officer.stunned = Math.max(officer.stunned, 0.35);
          addWanted(0.22);
          consumed = true;
          break;
        }
      }
    }

    if (!consumed) {
      for (const ped of state.peds) {
        const dx = ped.x - bullet.x;
        const dy = ped.y - bullet.y;
        if (dx * dx + dy * dy <= (ped.r + bullet.r) * (ped.r + bullet.r)) {
          ped.stunned = 2.3;
          ped.panic = 3;
          addWanted(0.38);
          consumed = true;
          break;
        }
      }
    }

    if (!consumed) {
      for (const car of state.cars) {
        if (state.player.inCarId === car.id) continue;
        const dx = car.x - bullet.x;
        const dy = car.y - bullet.y;
        if (dx * dx + dy * dy <= (car.r + bullet.r) * (car.r + bullet.r)) {
          car.vx += bullet.vx * 0.02;
          car.vy += bullet.vy * 0.02;
          addWanted(0.08);
          consumed = true;
          break;
        }
      }
    }

    if (consumed) {
      state.bullets.splice(i, 1);
    }
  }

  for (let i = state.muzzleFlashes.length - 1; i >= 0; i -= 1) {
    state.muzzleFlashes[i].ttl -= dt;
    if (state.muzzleFlashes[i].ttl <= 0) {
      state.muzzleFlashes.splice(i, 1);
    }
  }

  state.taskTargets = state.taskTargets.filter((target) => target.hp > 0);
}

function resolveCollisions() {
  for (const car of state.cars) {
    resolveCircleVsBuildings(car);
  }
  for (const ped of state.peds) {
    resolveCircleVsBuildings(ped);
  }
  for (const officer of state.officers) {
    resolveCircleVsBuildings(officer);
  }

  if (state.player.inCarId === null) {
    resolveCircleVsBuildings(state.player);
  }

  for (let i = 0; i < state.cars.length; i += 1) {
    for (let j = i + 1; j < state.cars.length; j += 1) {
      resolveDynamicCircle(state.cars[i], state.cars[j], 0.13);
    }
  }

  for (const car of state.cars) {
    for (const ped of state.peds) {
      const impact = resolveDynamicCircle(car, ped, 0.15);
      if (impact > 38) ped.panic = 2;
      if (impact > 86) ped.stunned = 2.5;
      if (state.player.inCarId === car.id && impact > 76) {
        addWanted(0.55);
        damagePlayer(impact * 0.008);
      }
    }

    for (const officer of state.officers) {
      const impact = resolveDynamicCircle(car, officer, 0.14);
      if (impact > 72) {
        officer.stunned = 1.4;
        officer.hp -= impact * 0.45;
        if (state.player.inCarId === car.id) addWanted(0.65);
      }
    }
  }

  if (state.player.inCarId === null) {
    for (const car of state.cars) {
      const impact = resolveDynamicCircle(car, state.player, 0.12);
      if (impact > 44) {
        damagePlayer(impact * 0.19);
        state.collisionFlash = 0.34;
      }
    }

    for (const ped of state.peds) {
      const impact = resolveDynamicCircle(state.player, ped, 0.22);
      if (impact > 24) ped.panic = 1.7;
    }

    for (const officer of state.officers) {
      const impact = resolveDynamicCircle(state.player, officer, 0.18);
      if (impact > 34) {
        damagePlayer(impact * 0.1);
      }
    }
  }
}

function respawnPlayerFromArrest() {
  state.player.inCarId = null;
  state.player.x = 640;
  state.player.y = 520;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.facing = 0;
}

function updateWanted(dt) {
  if (state.time - state.lastCrimeTime > 11.5) {
    state.wanted = Math.max(0, state.wanted - dt * 0.12);
  }

  const anchor = getPlayerAnchor();
  let closestPolice = Infinity;

  for (const car of state.cars) {
    if (car.type !== "police") continue;
    const distance = Math.hypot(car.x - anchor.x, car.y - anchor.y);
    closestPolice = Math.min(closestPolice, distance);
  }

  for (const officer of state.officers) {
    const distance = Math.hypot(officer.x - anchor.x, officer.y - anchor.y);
    closestPolice = Math.min(closestPolice, distance);
  }

  if (state.wanted > 0.15) {
    if (closestPolice < 90) {
      state.bustedMeter = clamp(state.bustedMeter + dt * (0.38 + state.wanted * 0.17), 0, 1);
    } else {
      state.bustedMeter = Math.max(0, state.bustedMeter - dt * 0.2);
    }
  } else {
    state.bustedMeter = Math.max(0, state.bustedMeter - dt * 0.45);
  }

  if (state.bustedMeter >= 1) {
    state.bustedMeter = 0;
    state.wanted = 0;
    damagePlayer(14);
    respawnPlayerFromArrest();
  }

  if (state.player.health <= 0) {
    state.player.health = 100;
    state.wanted = Math.max(0, state.wanted - 1);
    respawnPlayerFromArrest();
  }

  state.collisionFlash = Math.max(0, state.collisionFlash - dt * 0.68);
}

function updateHealthRecovery(dt) {
  const movementInput = isKeyDown("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD");
  const speed = getPlayerSpeed();
  const stillEnough = speed < 8 && !movementInput;
  const recentlyShot = state.time - state.player.lastShotTime < 1.6;
  const cooldownOver = state.time - state.lastDamageTime >= CONFIG.healthRegenDelay;

  if (stillEnough && cooldownOver && !recentlyShot) {
    state.player.health = Math.min(100, state.player.health + CONFIG.healthRegenRate * dt);
  }
}

function updateMissionToast(dt) {
  if (!state.missionToast) return;
  state.missionToast.ttl -= dt;
  if (state.missionToast.ttl <= 0) {
    state.missionToast = null;
  }
}

function updateCamera(dt) {
  const anchor = getPlayerAnchor();
  const targetX = clamp(anchor.x - state.camera.width * 0.5, 0, CONFIG.worldWidth - state.camera.width);
  const targetY = clamp(anchor.y - state.camera.height * 0.5, 0, CONFIG.worldHeight - state.camera.height);
  const blend = dt <= 0 ? 1 : clamp(dt * 7.4, 0, 1);
  state.camera.x = lerp(state.camera.x, targetX, blend);
  state.camera.y = lerp(state.camera.y, targetY, blend);
}

function updateHud() {
  const inCar = state.player.inCarId !== null;
  const speed = getPlayerSpeed();

  hudMode.textContent = inCar ? "IN CAR" : "ON FOOT";
  hudHealth.textContent = `HEALTH ${Math.round(state.player.health)}`;
  hudWanted.textContent = `WANTED ${state.wanted.toFixed(1)}`;
  hudSpeed.textContent = `SPEED ${Math.round(speed)}`;
  hudMoney.textContent = `CASH $${Math.round(state.money)}`;

  if (state.activeTask) {
    hudTask.textContent = `TASK: ${state.activeTask.title} | ${state.activeTask.description}`;
  } else {
    hudTask.textContent = "TASK: WAITING FOR NEXT JOB";
  }
}

function updateGame(dt) {
  state.time += dt;

  if (state.player.inCarId === null) {
    updatePlayerOnFoot(dt);
  } else {
    updatePlayerInCar(dt);
  }

  for (const car of state.cars) {
    if (car.id === state.player.inCarId) continue;

    if (car.parked) {
      if (state.time > 12) {
        car.parked = false;
      } else {
        car.vx *= 0.7;
        car.vy *= 0.7;
        car.forwardSpeed = 0;
        continue;
      }
    }

    const control = car.type === "police" ? computePoliceControl(car) : computeTrafficControl(car);
    updateVehicle(car, dt, control);
  }

  updatePedestrians(dt);
  updateOfficers(dt);
  updateBullets(dt);
  resolveCollisions();
  updateTasks(dt);
  updateWanted(dt);
  updateHealthRecovery(dt);
  updateMissionToast(dt);
  updateCamera(dt);
  updateHud();
}

function worldToScreen(x, y) {
  return {
    x: x - state.camera.x,
    y: y - state.camera.y,
  };
}

function drawRoundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawBackground() {
  const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  baseGradient.addColorStop(0, "#9ec480");
  baseGradient.addColorStop(1, "#88ae6d");
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tile = 42;
  for (let y = -((state.camera.y % tile) + tile); y < canvas.height + tile; y += tile) {
    for (let x = -((state.camera.x % tile) + tile); x < canvas.width + tile; x += tile) {
      const noise = Math.sin((x + state.camera.x) * 0.013 + (y + state.camera.y) * 0.017);
      const alpha = 0.04 + (noise + 1) * 0.02;
      ctx.fillStyle = `rgba(68, 105, 44, ${alpha.toFixed(3)})`;
      ctx.fillRect(x + 1, y + 1, 2, 2);
    }
  }
}

function drawRoads() {
  for (const road of state.map.roads) {
    const sx = road.x - state.camera.x;
    const sy = road.y - state.camera.y;

    ctx.fillStyle = "#60656d";
    ctx.fillRect(sx, sy, road.w, road.h);

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    if (road.orientation === "horizontal") {
      for (let x = sx; x < sx + road.w; x += 28) {
        ctx.fillRect(x, sy + 4, 14, road.h - 8);
      }
    } else {
      for (let y = sy; y < sy + road.h; y += 28) {
        ctx.fillRect(sx + 4, y, road.w - 8, 14);
      }
    }

    ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, road.w, road.h);
  }

  const laneOffset = CONFIG.roadWidth * 0.28;
  ctx.strokeStyle = "rgba(239, 242, 245, 0.92)";
  ctx.lineWidth = 2;
  ctx.setLineDash([17, 17]);
  ctx.beginPath();
  for (const y of state.map.hRoadCenters) {
    const sy1 = y - laneOffset - state.camera.y;
    const sy2 = y + laneOffset - state.camera.y;
    ctx.moveTo(-state.camera.x, sy1);
    ctx.lineTo(CONFIG.worldWidth - state.camera.x, sy1);
    ctx.moveTo(-state.camera.x, sy2);
    ctx.lineTo(CONFIG.worldWidth - state.camera.x, sy2);
  }
  for (const x of state.map.vRoadCenters) {
    const sx1 = x - laneOffset - state.camera.x;
    const sx2 = x + laneOffset - state.camera.x;
    ctx.moveTo(sx1, -state.camera.y);
    ctx.lineTo(sx1, CONFIG.worldHeight - state.camera.y);
    ctx.moveTo(sx2, -state.camera.y);
    ctx.lineTo(sx2, CONFIG.worldHeight - state.camera.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const cross of state.map.crosswalks) {
    const sx = cross.x - state.camera.x;
    const sy = cross.y - state.camera.y;
    ctx.fillStyle = "rgba(250, 252, 254, 0.7)";
    if (cross.orientation === "horizontal") {
      for (let x = sx; x < sx + cross.w; x += 16) {
        ctx.fillRect(x, sy, 8, cross.h);
      }
    } else {
      for (let y = sy; y < sy + cross.h; y += 16) {
        ctx.fillRect(sx, y, cross.w, 8);
      }
    }
  }
}

function drawProps() {
  for (const prop of state.map.props) {
    const pos = worldToScreen(prop.x, prop.y);
    if (pos.x < -80 || pos.y < -80 || pos.x > canvas.width + 80 || pos.y > canvas.height + 80) continue;

    if (prop.type === "tree") {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(pos.x + 2, pos.y + prop.r * 0.58, prop.r * 1.05, prop.r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#6f4e2d";
      ctx.fillRect(pos.x - 2, pos.y + prop.r * 0.3, 4, prop.r * 0.95);

      const crown = ctx.createRadialGradient(pos.x, pos.y, 3, pos.x, pos.y, prop.r);
      crown.addColorStop(0, "#79b05a");
      crown.addColorStop(1, "#4d7e36");
      ctx.fillStyle = crown;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, prop.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.type === "lamp") {
      ctx.strokeStyle = "#494d50";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x, pos.y - prop.h);
      ctx.stroke();

      ctx.fillStyle = "#d4d3bc";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - prop.h - 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBuildingShell(building, sx, sy) {
  const shadowOffset = Math.max(4, Math.min(14, building.floors * 0.5));
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.fillRect(sx + shadowOffset, sy + shadowOffset, building.w, building.h);

  const bodyGradient = ctx.createLinearGradient(sx, sy, sx + building.w, sy + building.h);
  bodyGradient.addColorStop(0, building.style.wall);
  bodyGradient.addColorStop(1, building.style.trim);
  ctx.fillStyle = bodyGradient;
  ctx.fillRect(sx, sy, building.w, building.h);

  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(sx, sy, building.w, building.h);

  ctx.fillStyle = building.style.roof;
  const inset = building.roofInset;
  ctx.fillRect(sx + inset, sy + inset, building.w - inset * 2, building.h - inset * 2);

  ctx.fillStyle = building.style.window;
  if (building.type !== "industrial") {
    for (let y = sy + 16; y < sy + building.h - 12; y += building.windowStepY) {
      for (let x = sx + 16; x < sx + building.w - 12; x += building.windowStepX) {
        ctx.fillRect(x, y, 7, 5);
      }
    }
  } else {
    for (let x = sx + 16; x < sx + building.w - 16; x += 20) {
      ctx.fillRect(x, sy + building.h * 0.34, 11, 7);
    }
  }

  if (building.hasAwning) {
    ctx.fillStyle = building.awningColor;
    ctx.fillRect(sx + building.w * 0.16, sy + building.h - 12, building.w * 0.68, 10);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.24)";
    ctx.strokeRect(sx + building.w * 0.16, sy + building.h - 12, building.w * 0.68, 10);
  }
}

function drawBuildings() {
  for (const building of state.map.buildings) {
    const sx = building.x - state.camera.x;
    const sy = building.y - state.camera.y;
    if (sx > canvas.width + 40 || sy > canvas.height + 40 || sx + building.w < -40 || sy + building.h < -40) continue;
    drawBuildingShell(building, sx, sy);
  }
}

function drawTaskTargets() {
  for (const target of state.taskTargets) {
    const pos = worldToScreen(target.x, target.y);
    if (pos.x < -40 || pos.y < -40 || pos.x > canvas.width + 40 || pos.y > canvas.height + 40) continue;

    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(pos.x + 2, pos.y + target.r * 0.68, target.r * 1.1, target.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    const crateGradient = ctx.createLinearGradient(pos.x - target.r, pos.y - target.r, pos.x + target.r, pos.y + target.r);
    crateGradient.addColorStop(0, "#a86d3f");
    crateGradient.addColorStop(1, "#7f4f2c");
    ctx.fillStyle = crateGradient;
    drawRoundedRect(pos.x - target.r, pos.y - target.r, target.r * 2, target.r * 2, 4);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 232, 183, 0.88)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pos.x - target.r + 3, pos.y - target.r + 3, target.r * 2 - 6, target.r * 2 - 6);

    const ratio = target.hp / target.maxHp;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(pos.x - target.r, pos.y + target.r + 4, target.r * 2, 4);
    ctx.fillStyle = "#74d56f";
    ctx.fillRect(pos.x - target.r, pos.y + target.r + 4, target.r * 2 * ratio, 4);
  }
}

function drawVehicleBody(car) {
  const bodyGradient = ctx.createLinearGradient(-car.length * 0.5, 0, car.length * 0.5, 0);
  if (car.type === "police") {
    bodyGradient.addColorStop(0, "#f1f2f3");
    bodyGradient.addColorStop(1, "#d4d6d9");
  } else {
    bodyGradient.addColorStop(0, car.color);
    bodyGradient.addColorStop(1, "#5b5f63");
  }

  ctx.fillStyle = bodyGradient;
  drawRoundedRect(-car.length * 0.5, -car.width * 0.5, car.length, car.width, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  drawRoundedRect(-car.length * 0.3, -car.width * 0.38, car.length * 0.42, car.width * 0.3, 4);
  ctx.fill();

  ctx.fillStyle = "rgba(15, 17, 24, 0.48)";
  drawRoundedRect(-car.length * 0.1, -car.width * 0.33, car.length * 0.42, car.width * 0.66, 4);
  ctx.fill();

  ctx.fillStyle = "#171717";
  ctx.fillRect(-car.length * 0.42, -car.width * 0.54, 12, 4);
  ctx.fillRect(car.length * 0.3, -car.width * 0.54, 12, 4);
  ctx.fillRect(-car.length * 0.42, car.width * 0.54 - 4, 12, 4);
  ctx.fillRect(car.length * 0.3, car.width * 0.54 - 4, 12, 4);

  ctx.fillStyle = "#f0ed9f";
  ctx.fillRect(car.length * 0.44 - 5, -car.width * 0.2, 5, 4);
  ctx.fillRect(car.length * 0.44 - 5, car.width * 0.2 - 4, 5, 4);

  ctx.fillStyle = "#d55353";
  ctx.fillRect(-car.length * 0.5, -car.width * 0.2, 5, 4);
  ctx.fillRect(-car.length * 0.5, car.width * 0.2 - 4, 5, 4);

  if (car.type === "police") {
    const blink = Math.sin(state.time * 11 + car.sirenPhase) > 0;
    ctx.fillStyle = blink ? "#3f7bff" : "#ff4f4f";
    ctx.fillRect(-4, -car.width * 0.5 - 4, 8, 6);
    ctx.fillStyle = blink ? "#ff4f4f" : "#3f7bff";
    ctx.fillRect(5, -car.width * 0.5 - 4, 8, 6);
  }
}

function drawCars() {
  for (const car of state.cars) {
    const pos = worldToScreen(car.x, car.y);
    if (pos.x < -90 || pos.y < -90 || pos.x > canvas.width + 90 || pos.y > canvas.height + 90) continue;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(car.angle);

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(0, car.width * 0.58, car.length * 0.45, car.width * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    drawVehicleBody(car);

    if (state.player.inCarId === car.id) {
      ctx.strokeStyle = "#d7ff8f";
      ctx.lineWidth = 2;
      drawRoundedRect(-car.length * 0.5 - 2, -car.width * 0.5 - 2, car.length + 4, car.width + 4, 10);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPedEntity(entity, isOfficer) {
  const pos = worldToScreen(entity.x, entity.y);
  if (pos.x < -30 || pos.y < -30 || pos.x > canvas.width + 30 || pos.y > canvas.height + 30) return;

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(pos.x + 1.5, pos.y + entity.r * 0.72, entity.r * 0.82, entity.r * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();

  const legSwing = Math.sin(entity.legPhase) * 2;
  ctx.strokeStyle = isOfficer ? "#142740" : "#2f2f2f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pos.x - 2, pos.y + 5);
  ctx.lineTo(pos.x - 4 + legSwing, pos.y + 10);
  ctx.moveTo(pos.x + 2, pos.y + 5);
  ctx.lineTo(pos.x + 4 - legSwing, pos.y + 10);
  ctx.stroke();

  ctx.fillStyle = isOfficer ? "#284c7a" : entity.shirtColor;
  drawRoundedRect(pos.x - 5, pos.y - 2, 10, 10, 3);
  ctx.fill();

  ctx.fillStyle = isOfficer ? "#d6c1a7" : entity.skinColor;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 6, 4.3, 0, Math.PI * 2);
  ctx.fill();

  if (isOfficer) {
    ctx.fillStyle = "#1d2b3f";
    ctx.fillRect(pos.x - 5, pos.y - 10, 10, 2.5);
  }
}

function drawPedestrians() {
  for (const ped of state.peds) {
    drawPedEntity(ped, false);
  }
  for (const officer of state.officers) {
    drawPedEntity(officer, true);
  }
}

function drawPlayer() {
  if (state.player.inCarId !== null) return;
  const pos = worldToScreen(state.player.x, state.player.y);

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(pos.x + 1.5, pos.y + state.player.r * 0.74, state.player.r * 0.9, state.player.r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f2d76f";
  drawRoundedRect(pos.x - 7, pos.y - 3, 14, 13, 4);
  ctx.fill();

  ctx.fillStyle = "#eac09c";
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 8, 5, 0, Math.PI * 2);
  ctx.fill();

  const fx = Math.cos(state.player.facing) * 16;
  const fy = Math.sin(state.player.facing) * 16;
  ctx.strokeStyle = "#2f2418";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - 2);
  ctx.lineTo(pos.x + fx, pos.y + fy - 2);
  ctx.stroke();
}

function drawBullets() {
  for (const bullet of state.bullets) {
    const a = worldToScreen(bullet.prevX, bullet.prevY);
    const b = worldToScreen(bullet.x, bullet.y);

    ctx.strokeStyle = "rgba(255, 228, 129, 0.78)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.fillStyle = "#fff2a8";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const flash of state.muzzleFlashes) {
    const p = worldToScreen(flash.x, flash.y);
    const alpha = clamp(flash.ttl / 0.08, 0, 1);
    ctx.fillStyle = `rgba(255, 211, 122, ${(0.5 * alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10 * alpha + 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMissionMarker() {
  if (!state.activeTask) return;
  const { waypoint, radius } = state.activeTask;
  const pos = worldToScreen(waypoint.x, waypoint.y);

  if (pos.x > -140 && pos.x < canvas.width + 140 && pos.y > -140 && pos.y < canvas.height + 140) {
    ctx.strokeStyle = "rgba(255, 224, 111, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    const pulse = 14 + Math.sin(state.time * 4) * 3;
    ctx.fillStyle = "rgba(255, 208, 94, 0.86)";
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - pulse);
    ctx.lineTo(pos.x - 8, pos.y - pulse - 16);
    ctx.lineTo(pos.x + 8, pos.y - pulse - 16);
    ctx.closePath();
    ctx.fill();
  }
}

function drawMiniMap() {
  const mapW = 230;
  const mapH = 176;
  const pad = 16;
  const x = canvas.width - mapW - pad;
  const y = canvas.height - mapH - pad;

  ctx.fillStyle = "rgba(9, 12, 17, 0.55)";
  drawRoundedRect(x, y, mapW, mapH, 10);
  ctx.fill();

  ctx.strokeStyle = "rgba(190, 212, 234, 0.35)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const sx = mapW / CONFIG.worldWidth;
  const sy = mapH / CONFIG.worldHeight;

  ctx.fillStyle = "rgba(78, 86, 95, 0.85)";
  for (const road of state.map.roads) {
    ctx.fillRect(x + road.x * sx, y + road.y * sy, Math.max(1, road.w * sx), Math.max(1, road.h * sy));
  }

  ctx.fillStyle = "rgba(102, 114, 123, 0.85)";
  for (const building of state.map.buildings) {
    ctx.fillRect(x + building.x * sx, y + building.y * sy, building.w * sx, building.h * sy);
  }

  if (state.activeTask) {
    ctx.fillStyle = "#f7cf68";
    ctx.beginPath();
    ctx.arc(x + state.activeTask.waypoint.x * sx, y + state.activeTask.waypoint.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ff6d6d";
  for (const officer of state.officers) {
    ctx.fillRect(x + officer.x * sx - 1, y + officer.y * sy - 1, 3, 3);
  }

  for (const car of state.cars) {
    if (car.type !== "police") continue;
    ctx.fillRect(x + car.x * sx - 1, y + car.y * sy - 1, 3, 3);
  }

  ctx.fillStyle = "#9eea96";
  ctx.beginPath();
  ctx.arc(x + state.player.x * sx, y + state.player.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(194, 238, 255, 0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + state.camera.x * sx, y + state.camera.y * sy, state.camera.width * sx, state.camera.height * sy);

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "600 11px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("MINIMAP", x + 8, y + 14);
}

function drawAlerts() {
  if (state.wanted > 0) {
    const alpha = clamp(state.wanted / 7.8, 0, 0.27);
    const gradient = ctx.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.height * 0.22,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.height * 0.74
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(196, 34, 34, ${alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.collisionFlash > 0) {
    ctx.fillStyle = `rgba(255, 60, 60, ${(state.collisionFlash * 0.42).toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.wanted > 0.15) {
    const width = Math.round(canvas.width * state.bustedMeter);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20);
    ctx.fillStyle = "#ff5f5f";
    ctx.fillRect(0, canvas.height - 20, width, 20);
  }

  if (state.missionToast) {
    const alpha = clamp(state.missionToast.ttl / 2.8, 0, 1);
    const width = Math.min(560, canvas.width - 40);
    const x = canvas.width * 0.5 - width * 0.5;
    const y = canvas.height - 68;
    ctx.fillStyle = `rgba(8, 14, 24, ${(0.68 * alpha).toFixed(3)})`;
    drawRoundedRect(x, y, width, 38, 8);
    ctx.fill();

    ctx.fillStyle = `rgba(252, 232, 168, ${(0.95 * alpha).toFixed(3)})`;
    ctx.font = "700 16px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.missionToast.text, canvas.width * 0.5, y + 24);
  }

  if (state.paused) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.46)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 46px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", canvas.width * 0.5, canvas.height * 0.5);
  }
}

function render() {
  drawBackground();
  drawRoads();
  drawProps();
  drawBuildings();
  drawTaskTargets();
  drawCars();
  drawPedestrians();
  drawPlayer();
  drawBullets();
  drawMissionMarker();
  drawAlerts();
  drawMiniMap();
}

function startGame() {
  state.mode = "playing";
  state.paused = false;
  startOverlay.classList.add("hidden");
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
  resizeCanvas();
}

function handleKeyDown(event) {
  const { code } = event;
  if (!input.keys.has(code)) {
    input.pressed.add(code);
  }
  input.keys.add(code);

  if (code === "Enter" && state.mode === "menu") {
    startGame();
  } else if (code === "KeyP" && state.mode === "playing") {
    state.paused = !state.paused;
  } else if (code === "KeyR" && state.mode === "playing") {
    resetWorld(true);
  } else if (code === "KeyF") {
    toggleFullscreen().catch(() => {});
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) {
    event.preventDefault();
  }
}

function handleKeyUp(event) {
  input.keys.delete(event.code);
}

let lastFrame = performance.now();
function gameLoop(now) {
  const delta = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (state.mode === "playing" && !state.paused) {
    state.accumulator += delta;
    while (state.accumulator >= CONFIG.fixedDt) {
      updateGame(CONFIG.fixedDt);
      state.accumulator -= CONFIG.fixedDt;
    }
  } else {
    updateCamera(delta);
  }

  render();
  input.pressed.clear();
  requestAnimationFrame(gameLoop);
}

function visibleEntities(maxCount, source, pick) {
  const found = [];
  for (const item of source) {
    if (
      item.x < state.camera.x - 120 ||
      item.y < state.camera.y - 120 ||
      item.x > state.camera.x + state.camera.width + 120 ||
      item.y > state.camera.y + state.camera.height + 120
    ) {
      continue;
    }
    found.push(pick(item));
    if (found.length >= maxCount) break;
  }
  return found;
}

window.render_game_to_text = () => {
  const inCar = state.player.inCarId !== null;
  const activeCar = inCar ? getCarById(state.player.inCarId) : null;

  const payload = {
    mode: state.mode,
    paused: state.paused,
    coordinateSystem: {
      origin: "top-left of world",
      xAxis: "increases right",
      yAxis: "increases down",
      units: "world pixels",
    },
    timeSeconds: Number(state.time.toFixed(2)),
    world: {
      width: CONFIG.worldWidth,
      height: CONFIG.worldHeight,
    },
    camera: {
      x: Number(state.camera.x.toFixed(1)),
      y: Number(state.camera.y.toFixed(1)),
      width: state.camera.width,
      height: state.camera.height,
    },
    player: {
      onFoot: !inCar,
      x: Number(state.player.x.toFixed(1)),
      y: Number(state.player.y.toFixed(1)),
      vx: Number(state.player.vx.toFixed(1)),
      vy: Number(state.player.vy.toFixed(1)),
      health: Number(state.player.health.toFixed(1)),
      wanted: Number(state.wanted.toFixed(2)),
      money: Math.round(state.money),
      facingRadians: Number(state.player.facing.toFixed(2)),
      speed: Number(getPlayerSpeed().toFixed(1)),
    },
    controlledVehicle: activeCar
      ? {
          id: activeCar.id,
          type: activeCar.type,
          x: Number(activeCar.x.toFixed(1)),
          y: Number(activeCar.y.toFixed(1)),
          speed: Number(activeCar.forwardSpeed.toFixed(1)),
          headingRadians: Number(activeCar.angle.toFixed(2)),
        }
      : null,
    task: state.activeTask
      ? {
          type: state.activeTask.type,
          title: state.activeTask.title,
          description: state.activeTask.description,
          reward: state.activeTask.reward,
          waypoint: {
            x: Number(state.activeTask.waypoint.x.toFixed(1)),
            y: Number(state.activeTask.waypoint.y.toFixed(1)),
            radius: state.activeTask.radius,
          },
          targetsRemaining: state.taskTargets.length,
        }
      : null,
    policePressure: Number(state.bustedMeter.toFixed(2)),
    bulletsActive: state.bullets.length,
    visibleTraffic: visibleEntities(12, state.cars, (car) => ({
      id: car.id,
      type: car.type,
      x: Number(car.x.toFixed(1)),
      y: Number(car.y.toFixed(1)),
      speed: Number(car.forwardSpeed.toFixed(1)),
    })),
    visiblePedestrians: visibleEntities(12, state.peds, (ped) => ({
      id: ped.id,
      x: Number(ped.x.toFixed(1)),
      y: Number(ped.y.toFixed(1)),
      panic: Number(ped.panic.toFixed(2)),
      stunned: Number(ped.stunned.toFixed(2)),
    })),
    visiblePoliceOnFoot: visibleEntities(8, state.officers, (officer) => ({
      id: officer.id,
      x: Number(officer.x.toFixed(1)),
      y: Number(officer.y.toFixed(1)),
      hp: Number(officer.hp.toFixed(1)),
      stunned: Number(officer.stunned.toFixed(2)),
    })),
    visibleTaskTargets: visibleEntities(8, state.taskTargets, (target) => ({
      id: target.id,
      x: Number(target.x.toFixed(1)),
      y: Number(target.y.toFixed(1)),
      hp: target.hp,
    })),
    counts: {
      cars: state.cars.length,
      pedestrians: state.peds.length,
      buildings: state.map.buildings.length,
      officers: state.officers.length,
    },
  };

  return JSON.stringify(payload);
};

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    if (state.mode === "playing" && !state.paused) {
      updateGame(CONFIG.fixedDt);
    }
  }
  render();
  input.pressed.clear();
};

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("resize", resizeCanvas);
window.addEventListener("fullscreenchange", resizeCanvas);
startButton.addEventListener("click", startGame);

resizeCanvas();
resetWorld(false);
render();
requestAnimationFrame(gameLoop);
