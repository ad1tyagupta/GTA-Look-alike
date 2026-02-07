const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startOverlay = document.getElementById("start-overlay");
const startButton = document.getElementById("start-btn");
const hudMode = document.getElementById("hud-mode");
const hudHealth = document.getElementById("hud-health");
const hudWanted = document.getElementById("hud-wanted");
const hudSpeed = document.getElementById("hud-speed");

const CONFIG = {
  worldWidth: 3600,
  worldHeight: 2600,
  fixedDt: 1 / 60,
  roadWidth: 150,
  playerAccel: 760,
  playerDrag: 5.2,
  playerMaxSpeed: 220,
  interactionRange: 58,
};

const input = {
  keys: new Set(),
  pressed: new Set(),
};

let carIdCounter = 0;
let pedestrianIdCounter = 0;
let rngState = 1;

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
  map: null,
  player: null,
  cars: [],
  peds: [],
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

function getPlayerAnchor() {
  if (state.player.inCarId !== null) {
    const car = getCarById(state.player.inCarId);
    if (car) {
      return { x: car.x, y: car.y };
    }
  }
  return { x: state.player.x, y: state.player.y };
}

function resizeCanvas() {
  const cssWidth = Math.max(800, Math.min(window.innerWidth, 1400));
  const cssHeight = Math.max(520, Math.min(window.innerHeight, 860));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth);
  canvas.height = Math.floor(cssHeight);
  state.camera.width = canvas.width;
  state.camera.height = canvas.height;
}

function createCityMap() {
  const roads = [];
  const buildings = [];
  const sidewalkNodes = [];
  const carPaths = [];
  const vRoadCenters = [420, 920, 1420, 2020, 2620, 3220];
  const hRoadCenters = [340, 840, 1340, 1840, 2340];
  const roadW = CONFIG.roadWidth;

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

  const palette = ["#8f8f84", "#8b8680", "#9b9488", "#a39b8d", "#7f786d"];
  for (let ix = 0; ix < vRoadCenters.length - 1; ix += 1) {
    for (let iy = 0; iy < hRoadCenters.length - 1; iy += 1) {
      const left = vRoadCenters[ix] + roadW * 0.5 + 26;
      const right = vRoadCenters[ix + 1] - roadW * 0.5 - 26;
      const top = hRoadCenters[iy] + roadW * 0.5 + 26;
      const bottom = hRoadCenters[iy + 1] - roadW * 0.5 - 26;
      const width = right - left;
      const height = bottom - top;
      if (width <= 120 || height <= 120) continue;
      const insetX = rand(6, 24);
      const insetY = rand(6, 24);
      buildings.push({
        x: left + insetX,
        y: top + insetY,
        w: width - insetX * 2,
        h: height - insetY * 2,
        color: randomChoice(palette),
      });
    }
  }

  for (const vx of vRoadCenters) {
    for (const hy of hRoadCenters) {
      const offset = roadW * 0.5 + 24;
      sidewalkNodes.push({ x: vx - offset, y: hy - offset });
      sidewalkNodes.push({ x: vx + offset, y: hy - offset });
      sidewalkNodes.push({ x: vx + offset, y: hy + offset });
      sidewalkNodes.push({ x: vx - offset, y: hy + offset });
    }
  }

  for (const y of hRoadCenters) {
    carPaths.push([
      { x: 120, y: y - 26 },
      { x: CONFIG.worldWidth - 120, y: y - 26 },
      { x: CONFIG.worldWidth - 120, y: y + 26 },
      { x: 120, y: y + 26 },
    ]);
  }

  for (const x of vRoadCenters) {
    carPaths.push([
      { x: x - 26, y: 120 },
      { x: x - 26, y: CONFIG.worldHeight - 120 },
      { x: x + 26, y: CONFIG.worldHeight - 120 },
      { x: x + 26, y: 120 },
    ]);
  }

  return {
    roads,
    buildings,
    sidewalkNodes,
    carPaths,
    vRoadCenters,
    hRoadCenters,
  };
}

function makeVehicle(type, path, segment, t, color) {
  const a = path[segment % path.length];
  const b = path[(segment + 1) % path.length];
  const x = lerp(a.x, b.x, t);
  const y = lerp(a.y, b.y, t);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const police = type === "police";
  return {
    id: ++carIdCounter,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    r: police ? 22 : 20,
    mass: police ? 1950 : 1650,
    angle,
    width: police ? 38 : 34,
    length: police ? 68 : 62,
    color,
    path,
    pathIndex: (segment + 1) % path.length,
    cruiseSpeed: police ? rand(175, 230) : rand(120, 190),
    engineAccel: police ? 810 : 660,
    brakePower: police ? 1050 : 900,
    steerPower: police ? 2.65 : 2.45,
    maxForward: police ? 360 : 280,
    maxReverse: police ? 140 : 110,
    grip: police ? 9.3 : 8.3,
    forwardSpeed: 0,
    sirenPhase: rand(0, Math.PI * 2),
    parked: false,
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
    maxSpeed: rand(32, 56),
    targetNode: Math.floor(random() * state.map.sidewalkNodes.length),
    panic: 0,
    stunned: 0,
    outfit: randomChoice(["#d8c19b", "#f0d8a8", "#d1bfb5", "#c0d8e8", "#f0c0c0"]),
  };
}

function resetWorld(startPlaying) {
  setSeed(20260207);
  carIdCounter = 0;
  pedestrianIdCounter = 0;

  state.time = 0;
  state.accumulator = 0;
  state.wanted = 0;
  state.lastCrimeTime = -9999;
  state.bustedMeter = 0;
  state.collisionFlash = 0;

  state.map = createCityMap();
  state.cars = [];
  state.peds = [];

  state.player = {
    x: 520,
    y: 460,
    vx: 0,
    vy: 0,
    r: 13,
    mass: 85,
    facing: 0,
    health: 100,
    inCarId: null,
  };

  const carColors = ["#d84848", "#f4c644", "#4f8fd8", "#54b56e", "#d18f56", "#b272c9", "#48bcb6"];
  for (let i = 0; i < 22; i += 1) {
    const path = state.map.carPaths[i % state.map.carPaths.length];
    const segment = Math.floor(random() * path.length);
    const t = random();
    state.cars.push(makeVehicle("traffic", path, segment, t, carColors[i % carColors.length]));
  }

  for (let i = 0; i < 6; i += 1) {
    const path = state.map.carPaths[(i + 3) % state.map.carPaths.length];
    const segment = Math.floor(random() * path.length);
    const t = random();
    state.cars.push(makeVehicle("police", path, segment, t, "#ffffff"));
  }

  const starterCar = makeVehicle("traffic", state.map.carPaths[0], 0, 0.14, "#f08b3e");
  starterCar.x = state.player.x + 28;
  starterCar.y = state.player.y + 58;
  starterCar.angle = -Math.PI * 0.5;
  starterCar.vx = 0;
  starterCar.vy = 0;
  starterCar.forwardSpeed = 0;
  starterCar.parked = true;
  state.cars.push(starterCar);

  for (let i = 0; i < 58; i += 1) {
    const node = randomChoice(state.map.sidewalkNodes);
    state.peds.push(makePedestrian(node.x + rand(-14, 14), node.y + rand(-14, 14)));
  }

  state.mode = startPlaying ? "playing" : "menu";
  state.paused = false;
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

  const brakeStep = (230 + car.brakePower * brake) * dt;
  if (Math.abs(forward) <= brakeStep) {
    forward = 0;
  } else {
    forward -= Math.sign(forward) * brakeStep;
  }
  forward *= Math.exp(-1.35 * dt);
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
    if (side < car.width) {
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
  const steer = clamp(angleError * 1.8, -1, 1);
  const turnPenalty = clamp(Math.abs(angleError) / Math.PI, 0, 0.72);
  const targetSpeed = car.cruiseSpeed * speedBias * (1 - turnPenalty);
  const currentSpeed = car.forwardSpeed;
  let throttle = currentSpeed < targetSpeed - 8 ? 1 : -0.25;
  let brake = currentSpeed > targetSpeed + 28 ? 1 : 0;

  const obstacle = detectObstacleAhead(car, 90);
  if (obstacle < Infinity) {
    if (obstacle < 45) {
      throttle = -0.8;
      brake = 1;
    } else if (obstacle < 80) {
      throttle = -0.4;
      brake = 0.6;
    }
  }
  return { throttle, brake, steer, distance };
}

function computeTrafficControl(car) {
  const target = car.path[car.pathIndex];
  const control = driveTowardTarget(car, target.x, target.y, 1);
  if (control.distance < 36) {
    car.pathIndex = (car.pathIndex + 1) % car.path.length;
  }
  return control;
}

function computePoliceControl(car) {
  if (state.wanted > 0.2) {
    const anchor = getPlayerAnchor();
    const control = driveTowardTarget(car, anchor.x, anchor.y, 1.55);
    if (control.distance < 110) {
      control.brake = Math.max(control.brake, 0.6);
      control.throttle = Math.min(control.throttle, 0.3);
    }
    return control;
  }
  const defaultControl = computeTrafficControl(car);
  defaultControl.throttle = Math.max(defaultControl.throttle, 0.35);
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
      body.forwardSpeed *= 0.4;
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
  if (speed > 8) state.player.facing = Math.atan2(state.player.vy, state.player.vx);
  if (consumePress("Space", "KeyE")) {
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
  if (consumePress("Space", "KeyE") && Math.abs(car.forwardSpeed) < 40) {
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
  state.player.inCarId = nearest.id;
  state.player.x = nearest.x;
  state.player.y = nearest.y;
  state.player.vx = nearest.vx;
  state.player.vy = nearest.vy;
  state.player.facing = nearest.angle;
}

function exitCurrentCar(car) {
  const side = Math.sign(Math.sin(state.time * 2.3)) || 1;
  const offsetX = Math.cos(car.angle + side * Math.PI * 0.5) * (car.r + state.player.r + 8);
  const offsetY = Math.sin(car.angle + side * Math.PI * 0.5) * (car.r + state.player.r + 8);
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
      ped.vx *= Math.exp(-5 * dt);
      ped.vy *= Math.exp(-5 * dt);
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
      const panicBoost = ped.panic > 0 ? 48 : 0;
      const accel = 170;
      ped.vx += dx * accel * dt;
      ped.vy += dy * accel * dt;
      ped.vx *= Math.exp(-3.8 * dt);
      ped.vy *= Math.exp(-3.8 * dt);
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
    resolveCircleVsBuildings(ped);
  }
}

function resolveCollisions() {
  for (const car of state.cars) {
    resolveCircleVsBuildings(car);
  }

  for (const ped of state.peds) {
    resolveCircleVsBuildings(ped);
  }

  if (state.player.inCarId === null) {
    resolveCircleVsBuildings(state.player);
  }

  for (let i = 0; i < state.cars.length; i += 1) {
    for (let j = i + 1; j < state.cars.length; j += 1) {
      resolveDynamicCircle(state.cars[i], state.cars[j], 0.12);
    }
  }

  for (const car of state.cars) {
    for (const ped of state.peds) {
      const impact = resolveDynamicCircle(car, ped, 0.14);
      if (impact > 36) ped.panic = 1.8;
      if (impact > 86) {
        ped.stunned = 2.4;
      }
      if (state.player.inCarId === car.id && impact > 78) {
        addWanted(0.55);
        state.player.health = clamp(state.player.health - impact * 0.008, 0, 100);
      }
    }
  }

  if (state.player.inCarId === null) {
    for (const car of state.cars) {
      const impact = resolveDynamicCircle(car, state.player, 0.12);
      if (impact > 42) {
        state.player.health = clamp(state.player.health - impact * 0.18, 0, 100);
        state.collisionFlash = 0.32;
      }
    }
    for (const ped of state.peds) {
      const impact = resolveDynamicCircle(state.player, ped, 0.22);
      if (impact > 26) {
        ped.panic = 1.5;
      }
    }
  }
}

function updateWanted(dt) {
  if (state.time - state.lastCrimeTime > 10) {
    state.wanted = Math.max(0, state.wanted - dt * 0.1);
  }
  const anchor = getPlayerAnchor();
  if (state.wanted > 0.15) {
    let closestPolice = Infinity;
    for (const car of state.cars) {
      if (car.type !== "police") continue;
      const distance = Math.hypot(car.x - anchor.x, car.y - anchor.y);
      closestPolice = Math.min(closestPolice, distance);
    }
    if (closestPolice < 78) {
      state.bustedMeter = clamp(state.bustedMeter + dt * (0.34 + state.wanted * 0.16), 0, 1);
    } else {
      state.bustedMeter = Math.max(0, state.bustedMeter - dt * 0.22);
    }
  } else {
    state.bustedMeter = Math.max(0, state.bustedMeter - dt * 0.4);
  }
  if (state.bustedMeter >= 1) {
    state.bustedMeter = 0;
    state.wanted = 0;
    state.player.health = Math.max(35, state.player.health - 15);
    state.player.inCarId = null;
    state.player.x = 540;
    state.player.y = 460;
    state.player.vx = 0;
    state.player.vy = 0;
  }

  if (state.player.health <= 0) {
    state.player.health = 100;
    state.player.inCarId = null;
    state.player.x = 540;
    state.player.y = 460;
    state.player.vx = 0;
    state.player.vy = 0;
    state.wanted = Math.max(0, state.wanted - 1);
  }
  state.collisionFlash = Math.max(0, state.collisionFlash - dt * 0.65);
}

function updateCamera(dt) {
  const anchor = getPlayerAnchor();
  const targetX = clamp(anchor.x - state.camera.width * 0.5, 0, CONFIG.worldWidth - state.camera.width);
  const targetY = clamp(anchor.y - state.camera.height * 0.5, 0, CONFIG.worldHeight - state.camera.height);
  const blend = dt <= 0 ? 1 : clamp(dt * 7, 0, 1);
  state.camera.x = lerp(state.camera.x, targetX, blend);
  state.camera.y = lerp(state.camera.y, targetY, blend);
}

function updateHud() {
  const inCar = state.player.inCarId !== null;
  let speed = magnitude(state.player.vx, state.player.vy);
  if (inCar) {
    const car = getCarById(state.player.inCarId);
    if (car) speed = Math.abs(car.forwardSpeed);
  }
  hudMode.textContent = inCar ? "IN CAR" : "ON FOOT";
  hudHealth.textContent = `HEALTH ${Math.round(state.player.health)}`;
  hudWanted.textContent = `WANTED ${state.wanted.toFixed(1)}`;
  hudSpeed.textContent = `SPEED ${Math.round(speed)}`;
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
  resolveCollisions();
  updateWanted(dt);
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
  ctx.fillStyle = "#a9cf87";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tile = 48;
  ctx.fillStyle = "rgba(78, 122, 50, 0.09)";
  for (let y = -((state.camera.y % tile) + tile); y < canvas.height + tile; y += tile) {
    for (let x = -((state.camera.x % tile) + tile); x < canvas.width + tile; x += tile) {
      ctx.fillRect(x + 3, y + 3, 2, 2);
    }
  }
}

function drawRoads() {
  for (const road of state.map.roads) {
    const sx = road.x - state.camera.x;
    const sy = road.y - state.camera.y;
    ctx.fillStyle = "#5c6066";
    ctx.fillRect(sx, sy, road.w, road.h);
  }

  ctx.strokeStyle = "#d7d9da";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  for (const y of state.map.hRoadCenters) {
    const sy = y - state.camera.y;
    if (sy < -12 || sy > canvas.height + 12) continue;
    ctx.moveTo(-state.camera.x, sy);
    ctx.lineTo(CONFIG.worldWidth - state.camera.x, sy);
  }
  for (const x of state.map.vRoadCenters) {
    const sx = x - state.camera.x;
    if (sx < -12 || sx > canvas.width + 12) continue;
    ctx.moveTo(sx, -state.camera.y);
    ctx.lineTo(sx, CONFIG.worldHeight - state.camera.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBuildings() {
  for (const building of state.map.buildings) {
    const sx = building.x - state.camera.x;
    const sy = building.y - state.camera.y;
    if (sx > canvas.width || sy > canvas.height || sx + building.w < 0 || sy + building.h < 0) continue;
    ctx.fillStyle = building.color;
    ctx.fillRect(sx, sy, building.w, building.h);
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.fillRect(sx + 4, sy + 4, building.w - 8, 7);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.17)";
    ctx.strokeRect(sx + 1, sy + 1, building.w - 2, building.h - 2);
  }
}

function drawPedestrians() {
  for (const ped of state.peds) {
    const pos = worldToScreen(ped.x, ped.y);
    if (pos.x < -20 || pos.y < -20 || pos.x > canvas.width + 20 || pos.y > canvas.height + 20) continue;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ped.r, 0, Math.PI * 2);
    ctx.fillStyle = ped.stunned > 0 ? "#f09d88" : ped.outfit;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 1.5, ped.r * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = "#303030";
    ctx.fill();
  }
}

function drawCars() {
  for (const car of state.cars) {
    const pos = worldToScreen(car.x, car.y);
    if (pos.x < -80 || pos.y < -80 || pos.x > canvas.width + 80 || pos.y > canvas.height + 80) continue;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(car.angle);

    drawRoundedRect(-car.length * 0.5, -car.width * 0.5, car.length, car.width, 8);
    ctx.fillStyle = car.type === "police" ? "#f3f3f3" : car.color;
    ctx.fill();

    ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
    drawRoundedRect(-car.length * 0.18, -car.width * 0.36, car.length * 0.5, car.width * 0.72, 4);
    ctx.fill();

    ctx.fillStyle = "#161616";
    ctx.fillRect(-car.length * 0.43, -car.width * 0.52, 10, 4);
    ctx.fillRect(car.length * 0.33, -car.width * 0.52, 10, 4);
    ctx.fillRect(-car.length * 0.43, car.width * 0.52 - 4, 10, 4);
    ctx.fillRect(car.length * 0.33, car.width * 0.52 - 4, 10, 4);

    if (car.type === "police") {
      const blink = Math.sin(state.time * 10 + car.sirenPhase) > 0;
      ctx.fillStyle = blink ? "#3f7bff" : "#ff4a4a";
      ctx.fillRect(-3, -car.width * 0.5 - 3, 6, 6);
      ctx.fillStyle = blink ? "#ff4a4a" : "#3f7bff";
      ctx.fillRect(4, -car.width * 0.5 - 3, 6, 6);
    }

    if (state.player.inCarId === car.id) {
      ctx.strokeStyle = "#d7ff8f";
      ctx.lineWidth = 2;
      drawRoundedRect(-car.length * 0.5 - 2, -car.width * 0.5 - 2, car.length + 4, car.width + 4, 10);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlayer() {
  if (state.player.inCarId !== null) return;
  const pos = worldToScreen(state.player.x, state.player.y);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, state.player.r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffe284";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#3e3522";
  ctx.stroke();
  const fx = Math.cos(state.player.facing) * 14;
  const fy = Math.sin(state.player.facing) * 14;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(pos.x + fx, pos.y + fy);
  ctx.strokeStyle = "#272018";
  ctx.stroke();
}

function drawAlerts() {
  if (state.wanted > 0) {
    const alpha = clamp(state.wanted / 8, 0, 0.25);
    const gradient = ctx.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.height * 0.2,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.height * 0.7
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(180, 20, 20, ${alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.collisionFlash > 0) {
    ctx.fillStyle = `rgba(255, 50, 50, ${state.collisionFlash * 0.45})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.wanted > 0.15) {
    const width = Math.round(canvas.width * state.bustedMeter);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, canvas.height - 18, canvas.width, 18);
    ctx.fillStyle = "#ff5f5f";
    ctx.fillRect(0, canvas.height - 18, width, 18);
  }

  if (state.paused) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
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
  drawBuildings();
  drawPedestrians();
  drawCars();
  drawPlayer();
  drawAlerts();
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

function visibleEntities(maxCount, mapper) {
  const found = [];
  for (const item of mapper.source) {
    if (
      item.x < state.camera.x - 80 ||
      item.y < state.camera.y - 80 ||
      item.x > state.camera.x + state.camera.width + 80 ||
      item.y > state.camera.y + state.camera.height + 80
    ) {
      continue;
    }
    found.push(mapper.pick(item));
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
    policePressure: Number(state.bustedMeter.toFixed(2)),
    visibleTraffic: visibleEntities(10, {
      source: state.cars,
      pick: (car) => ({
        id: car.id,
        type: car.type,
        x: Number(car.x.toFixed(1)),
        y: Number(car.y.toFixed(1)),
        speed: Number(car.forwardSpeed.toFixed(1)),
      }),
    }),
    visiblePedestrians: visibleEntities(14, {
      source: state.peds,
      pick: (ped) => ({
        id: ped.id,
        x: Number(ped.x.toFixed(1)),
        y: Number(ped.y.toFixed(1)),
        panic: Number(ped.panic.toFixed(2)),
        stunned: Number(ped.stunned.toFixed(2)),
      }),
    }),
    counts: {
      cars: state.cars.length,
      pedestrians: state.peds.length,
      buildings: state.map.buildings.length,
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
