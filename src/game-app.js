import { CONFIG, START_SCREEN_LINES, VEHICLE_CLASSES } from "./config.js";
import { AudioSystem } from "./audio.js";
import { MISSION_CHAIN } from "./missions.js";
import { createRenderAssets, renderGame } from "./render.js";
import { createWorld, findDistrict, findAccessiblePoint, makeSeededRng, nearestNavNode, pickRoadblockSpot, planNavRoute } from "./world.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function magnitude(x, y) {
  return Math.hypot(x, y);
}

function normalizeAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function makePaint(primary, secondary = "#4f5660") {
  return { primary, secondary };
}

function vehicleTuning(classId) {
  return VEHICLE_CLASSES[classId] || VEHICLE_CLASSES.sedan;
}

function buildVehicle(id, kind, classId, x, y, angle, paint, path = null) {
  const tuning = vehicleTuning(classId);
  return {
    id,
    kind,
    classId,
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    r: Math.max(tuning.width, tuning.length) * 0.34,
    mass: tuning.mass,
    width: tuning.width,
    length: tuning.length,
    engineAccel: tuning.engineAccel,
    brakePower: tuning.brakePower,
    steerPower: tuning.steerPower,
    maxForward: tuning.maxForward,
    maxReverse: tuning.maxReverse,
    grip: tuning.grip,
    forwardSpeed: 0,
    paint,
    path,
    pathIndex: path ? 1 : 0,
    state: kind === "police" ? "patrol" : "patrol",
    stateTimer: 0,
    flashPhase: Math.random() * Math.PI * 2,
    assignedRoadblock: null,
    deployedOfficers: [],
    offscreenRespawn: 0,
    health: kind === "police" ? 150 : classId === "truck" ? 210 : 120,
    lastSeenPlayer: null,
    navPath: [],
    navIndex: 0,
    navReplanAt: 0,
  };
}

function buildCivilian(id, x, y, rng) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 10,
    mass: 82,
    maxSpeed: 44 + rng() * 26,
    targetNode: null,
    panic: 0,
    stunned: 0,
    animPhase: rng() * Math.PI * 2,
    colors: {
      body: ["#467bc4", "#5aa26e", "#bc5e61", "#8a74c6", "#db9d4f"][Math.floor(rng() * 5)],
      legs: "#2d2d31",
      skin: ["#f1d4b0", "#d7b089", "#b88963", "#efd2c2"][Math.floor(rng() * 4)],
    },
  };
}

function buildOfficer(id, x, y, carId) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 10,
    mass: 90,
    health: 85,
    animPhase: 0,
    state: "pursue",
    stateTimer: 0,
    searchTimer: CONFIG.policeSearchDuration,
    shootCooldown: 0,
    facing: 0,
    carId,
    flankSide: Math.random() < 0.5 ? -1 : 1,
    lastSeenPlayer: null,
    weaponReady: true,
    navPath: [],
    navIndex: 0,
    navReplanAt: 0,
  };
}

function buildHostile(id, x, y) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 10,
    mass: 86,
    health: 72,
    animPhase: 0,
    state: "guard",
    stateTimer: 0,
    shootCooldown: 0,
    facing: 0,
    weaponReady: true,
    anchorX: x,
    anchorY: y,
  };
}

function cloneStage(stage) {
  return JSON.parse(JSON.stringify(stage));
}

function rebalanceStageForDefaultDifficulty(stage) {
  if (!stage) return stage;
  if (stage.radius) stage.radius = Math.round(stage.radius * 1.2);
  if (stage.duration) stage.duration = Math.max(6, Math.round(stage.duration * 0.65));
  if (stage.timeLimit) stage.timeLimit = Math.max(24, Math.round(stage.timeLimit * 1.45));
  if (stage.enemyCount) stage.enemyCount = Math.max(1, Math.ceil(stage.enemyCount * 0.5));
  if (stage.targetCount) stage.targetCount = Math.max(1, Math.ceil(stage.targetCount * 0.5));
  if (stage.wanted) stage.wanted = Number((stage.wanted * 0.62).toFixed(2));
  if (typeof stage.targetWanted === "number") stage.targetWanted = Math.min(0.8, Number((stage.targetWanted + 0.35).toFixed(2)));
  return stage;
}

function buildMissionTarget(id, x, y, kind = "crate") {
  return { id, x, y, r: 16, health: kind === "fuel" ? 4 : 2, kind };
}

function createInput() {
  return { keys: new Set(), pressed: new Set() };
}

function lineBlocked(world, x1, y1, x2, y2) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 40));
  for (let i = 1; i < steps; i += 1) {
    const x = x1 + (x2 - x1) * (i / steps);
    const y = y1 + (y2 - y1) * (i / steps);
    for (const building of world.buildings) {
      if (x >= building.x && x <= building.x + building.w && y >= building.y && y <= building.y + building.h) return true;
    }
  }
  return false;
}

function resolveCircleVsRect(body, rect) {
  const closestX = clamp(body.x, rect.x, rect.x + rect.w);
  const closestY = clamp(body.y, rect.y, rect.y + rect.h);
  let dx = body.x - closestX;
  let dy = body.y - closestY;
  let distance = Math.hypot(dx, dy);
  if (distance >= body.r) return false;
  if (distance < 0.0001) {
    dx = body.x < rect.x + rect.w * 0.5 ? -1 : 1;
    dy = body.y < rect.y + rect.h * 0.5 ? -1 : 1;
    distance = 1;
  } else {
    dx /= distance;
    dy /= distance;
  }
  const penetration = body.r - distance;
  body.x += dx * penetration;
  body.y += dy * penetration;
  if (body.vx !== undefined && body.vy !== undefined) {
    const speedInto = body.vx * dx + body.vy * dy;
    if (speedInto < 0) {
      body.vx -= speedInto * dx;
      body.vy -= speedInto * dy;
    }
  }
  return true;
}

function resolveWorldCollision(world, body) {
  for (const building of world.buildings) resolveCircleVsRect(body, building);
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
  const invA = 1 / Math.max(1, a.mass);
  const invB = 1 / Math.max(1, b.mass);
  const separation = (minDist - dist) * 0.96;
  const sumInv = invA + invB;
  a.x -= nx * separation * (invA / sumInv);
  a.y -= ny * separation * (invA / sumInv);
  b.x += nx * separation * (invB / sumInv);
  b.y += ny * separation * (invB / sumInv);
  const rvx = (b.vx || 0) - (a.vx || 0);
  const rvy = (b.vy || 0) - (a.vy || 0);
  const vel = rvx * nx + rvy * ny;
  if (vel >= 0) return 0;
  const impulse = (-(1 + restitution) * vel) / sumInv;
  if (a.vx !== undefined) {
    a.vx -= impulse * nx * invA;
    a.vy -= impulse * ny * invA;
  }
  if (b.vx !== undefined) {
    b.vx += impulse * nx * invB;
    b.vy += impulse * ny * invB;
  }
  return -vel;
}

export function initializeGame() {
  const SAVE_KEY = "city-heat-save-v1";
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
  const rng = makeSeededRng(20260307);
  const assets = createRenderAssets();
  const audio = new AudioSystem();
  const input = createInput();

  const state = {
    mode: "menu",
    paused: false,
    time: 0,
    accumulator: 0,
    camera: { x: 0, y: 0, width: 1280, height: 720 },
    world: createWorld(rng),
    player: {
      x: 1040,
      y: 860,
      vx: 0,
      vy: 0,
      r: 12,
      mass: 82,
      health: 100,
      money: 0,
      inCarId: null,
      facing: 0,
      animPhase: 0,
      nextShotAt: 0,
      lastShotTime: -9999,
      lastDamageTime: -9999,
      checkpoint: { x: 1040, y: 860 },
      hasPackage: false,
    },
    vehicles: [],
    civilians: [],
    hostiles: [],
    bullets: [],
    police: {
      officers: [],
      pressure: 0,
      lastCrimeTime: -9999,
      lastReinforcementTime: -9999,
      activeRoadblocks: [],
      searchOrigin: null,
    },
    mission: {
      missions: MISSION_CHAIN,
      index: 0,
      stageIndex: 0,
      current: MISSION_CHAIN[0],
      stage: MISSION_CHAIN[0].stages[0],
      stageLabel: MISSION_CHAIN[0].stages[0].label,
      marker: null,
      targets: [],
      timer: 0,
      toast: null,
      briefedMissionId: null,
      chaseVehicleId: null,
      chaseEnd: null,
      objectiveVehicleId: null,
      checkpointLabel: null,
      runtime: {},
      completed: false,
    },
    dialogue: {
      active: false,
      title: "",
      queue: [],
      index: 0,
      timer: 0,
    },
    save: {
      exists: false,
      loaded: false,
      lastSavedAt: null,
      toast: null,
    },
  };

  let nextIds = { vehicle: 1, civilian: 1, officer: 1, hostile: 1, bullet: 1, target: 1 };

  function nextId(kind) {
    const id = nextIds[kind];
    nextIds[kind] += 1;
    return id;
  }

  function setSaveToast(text) {
    state.save.toast = { text, ttl: 1.8 };
  }

  function persistProgress(forceCompleted = false) {
    try {
      const payload = {
        missionIndex: state.mission.index,
        stageIndex: state.mission.stageIndex,
        money: state.player.money,
        checkpoint: state.player.checkpoint,
        completed: forceCompleted || state.mission.completed,
        timestamp: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      state.save.exists = true;
      state.save.lastSavedAt = payload.timestamp;
      setSaveToast(payload.completed ? "OPERATION ARCHIVED" : "AUTO-SAVED");
    } catch {}
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      if (typeof data.money === "number") state.player.money = Math.max(0, data.money);
      if (data.checkpoint && typeof data.checkpoint.x === "number" && typeof data.checkpoint.y === "number") {
        state.player.checkpoint = { x: data.checkpoint.x, y: data.checkpoint.y };
        state.player.x = data.checkpoint.x;
        state.player.y = data.checkpoint.y;
      }
      state.save.exists = true;
      state.save.loaded = true;
      state.save.lastSavedAt = typeof data.timestamp === "number" ? data.timestamp : null;
      return data;
    } catch {
      return null;
    }
  }

  function clearSavedProgress() {
    try {
      localStorage.removeItem(SAVE_KEY);
      state.save.exists = false;
      state.save.loaded = false;
      state.save.lastSavedAt = null;
    } catch {}
  }

  function startDialogue(title, lines) {
    if (!lines?.length) return;
    state.dialogue.active = true;
    state.dialogue.title = title;
    state.dialogue.queue = lines.map((line) => ({ speaker: line.speaker || "Radio", text: line.text || "" }));
    state.dialogue.index = 0;
    state.dialogue.timer = 1.8;
    audio.playUiBlip();
  }

  function advanceDialogue() {
    if (!state.dialogue.active) return;
    state.dialogue.index += 1;
    if (state.dialogue.index >= state.dialogue.queue.length) {
      state.dialogue.active = false;
      state.dialogue.queue = [];
      state.dialogue.timer = 0;
      return;
    }
    state.dialogue.timer = 1.8;
    audio.playUiBlip();
  }

  function getVehicle(id) {
    return state.vehicles.find((vehicle) => vehicle.id === id) || null;
  }

  function spawnVehicle(kind, classId, x, y, angle, paint, path = null) {
    const vehicle = buildVehicle(nextId("vehicle"), kind, classId, x, y, angle, paint, path);
    state.vehicles.push(vehicle);
    return vehicle;
  }

  function spawnOfficer(x, y, carId) {
    const officer = buildOfficer(nextId("officer"), x, y, carId);
    state.police.officers.push(officer);
    return officer;
  }

  function spawnPoliceReinforcement(x, y, targetNode = null) {
    const path = state.world.carPaths[Math.floor(rng() * state.world.carPaths.length)];
    const angle = Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x);
    const vehicle = spawnVehicle("police", "interceptor", x, y, angle, makePaint("#f2f2f2", "#9aa5b3"), path);
    vehicle.pathIndex = 1;
    vehicle.state = targetNode ? "intercept" : "patrol";
    vehicle.health = 200;
    return vehicle;
  }

  function spawnHostile(x, y) {
    const hostile = buildHostile(nextId("hostile"), x, y);
    state.hostiles.push(hostile);
    return hostile;
  }

  function spawnTarget(x, y, kind = "crate") {
    const target = buildMissionTarget(nextId("target"), x, y, kind);
    state.mission.targets.push(target);
    return target;
  }

  function missionPoint(x, y, searchRadius = 220, padding = 22) {
    return findAccessiblePoint(state.world, x, y, searchRadius, 28, padding);
  }

  function bootstrapWorldPopulation() {
    const colors = [
      makePaint("#d84c4c", "#834343"),
      makePaint("#e2b54f", "#7d6742"),
      makePaint("#5b8ed6", "#465b86"),
      makePaint("#58ad70", "#3a5e47"),
      makePaint("#d48e58", "#71533f"),
      makePaint("#9d73cc", "#55446c"),
      makePaint("#52bcb4", "#325b59"),
    ];

    for (let i = 0; i < CONFIG.trafficCount; i += 1) {
      const path = state.world.carPaths[i % state.world.carPaths.length];
      const a = path[0];
      const b = path[1];
      const t = rng();
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const district = findDistrict(state.world, x, y);
      const classId =
        district.id === "industrial" ? (rng() < 0.36 ? "truck" : rng() < 0.58 ? "van" : "sedan") :
        district.id === "downtown" ? (rng() < 0.34 ? "muscle" : rng() < 0.66 ? "sedan" : "compact") :
        (rng() < 0.5 ? "compact" : rng() < 0.8 ? "sedan" : "muscle");
      const vehicle = spawnVehicle("traffic", classId, x, y, angle, colors[i % colors.length], path);
      vehicle.pathIndex = 1;
    }

    for (let i = 0; i < CONFIG.policeCarCount; i += 1) {
      const path = state.world.carPaths[(i * 3) % state.world.carPaths.length];
      const a = path[0];
      const b = path[1];
      const t = rng();
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const car = spawnVehicle("police", "interceptor", x, y, angle, makePaint("#f2f2f2", "#9aa5b3"), path);
      car.pathIndex = 1;
    }

    const starter = spawnVehicle("traffic", "compact", state.player.x + 60, state.player.y + 44, -Math.PI * 0.35, makePaint("#cda04a", "#664f34"));
    starter.state = "parked";
    starter.health = 140;
    state.mission.starterVehicleId = starter.id;

    for (let i = 0; i < CONFIG.civilianCount; i += 1) {
      const node = state.world.navNodes[Math.floor(rng() * state.world.navNodes.length)];
      const civilian = buildCivilian(nextId("civilian"), node.x + (rng() - 0.5) * 60, node.y + (rng() - 0.5) * 60, rng);
      civilian.targetNode = state.world.navNodes[Math.floor(rng() * state.world.navNodes.length)];
      state.civilians.push(civilian);
    }
  }

  bootstrapWorldPopulation();

  function resizeCanvas() {
    const cssWidth = Math.max(960, Math.min(window.innerWidth, 1600));
    const cssHeight = Math.max(620, Math.min(window.innerHeight, 980));
    canvas.width = Math.floor(cssWidth);
    canvas.height = Math.floor(cssHeight);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    state.camera.width = canvas.width;
    state.camera.height = canvas.height;
  }

  function applyVehiclePhysics(vehicle, throttle, steer, brake, dt) {
    const fx = Math.cos(vehicle.angle);
    const fy = Math.sin(vehicle.angle);
    const sx = -fy;
    const sy = fx;
    let forward = vehicle.vx * fx + vehicle.vy * fy;
    let lateral = vehicle.vx * sx + vehicle.vy * sy;
    forward += throttle * vehicle.engineAccel * dt;
    const brakeStep = (220 + vehicle.brakePower * brake) * dt;
    if (Math.abs(forward) <= brakeStep) forward = 0;
    else forward -= Math.sign(forward) * brakeStep;
    forward *= Math.exp(-1.28 * dt);
    forward = clamp(forward, -vehicle.maxReverse, vehicle.maxForward);
    lateral *= 1 - clamp(vehicle.grip * dt, 0, 1);
    vehicle.angle += steer * vehicle.steerPower * clamp(Math.abs(forward) / 170, 0.2, 1.5) * dt * (forward >= 0 ? 1 : -1);
    vehicle.vx = fx * forward + sx * lateral;
    vehicle.vy = fy * forward + sy * lateral;
    vehicle.x += vehicle.vx * dt;
    vehicle.y += vehicle.vy * dt;
    vehicle.forwardSpeed = forward;
    vehicle.flashPhase += dt * 7;
    vehicle.x = clamp(vehicle.x, vehicle.r, CONFIG.worldWidth - vehicle.r);
    vehicle.y = clamp(vehicle.y, vehicle.r, CONFIG.worldHeight - vehicle.r);
    resolveWorldCollision(state.world, vehicle);
  }

  function driveToward(vehicle, tx, ty, speedBias = 1) {
    const dx = tx - vehicle.x;
    const dy = ty - vehicle.y;
    const dist = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);
    const angleError = normalizeAngle(targetAngle - vehicle.angle);
    const steer = clamp(angleError * 1.9, -1, 1);
    const targetSpeed = vehicle.maxForward * 0.58 * speedBias * (1 - clamp(Math.abs(angleError) / Math.PI, 0, 0.72));
    const throttle = vehicle.forwardSpeed < targetSpeed - 10 ? 1 : -0.25;
    const brake = vehicle.forwardSpeed > targetSpeed + 28 ? 1 : 0;
    return { dist, steer, throttle, brake };
  }

  function ensureNavRoute(entity, tx, ty, refreshSeconds = 0.9) {
    if (!entity.navPath.length || entity.navIndex >= entity.navPath.length || state.time >= entity.navReplanAt) {
      entity.navPath = planNavRoute(state.world, entity.x, entity.y, tx, ty);
      entity.navIndex = 0;
      entity.navReplanAt = state.time + refreshSeconds;
    }
    return entity.navPath[entity.navIndex] || { x: tx, y: ty };
  }

  function advanceNavPoint(entity, reach = 42) {
    const node = entity.navPath[entity.navIndex];
    if (!node) return;
    if (Math.hypot(node.x - entity.x, node.y - entity.y) < reach) entity.navIndex += 1;
  }

  function setMissionToast(text, good = true) {
    state.mission.toast = { text, ttl: 2.8, good };
  }

  function setCheckpoint(anchorKey) {
    const anchor = state.world.missionAnchors[anchorKey];
    if (anchor) state.player.checkpoint = { x: anchor.x, y: anchor.y };
  }

  function clearMissionEntities() {
    state.hostiles = [];
    state.mission.targets = [];
    state.mission.chaseVehicleId = null;
    state.mission.chaseEnd = null;
    state.mission.objectiveVehicleId = null;
    state.player.hasPackage = false;
  }

  function currentStage() {
    return state.mission.current?.stages[state.mission.stageIndex] || null;
  }

  function setMissionMarker(stage) {
    if (!stage) {
      state.mission.marker = null;
      return;
    }
    if (stage.anchor) {
      const a = state.world.missionAnchors[stage.anchor];
      state.mission.marker = a ? { x: a.x, y: a.y, radius: stage.radius || 100 } : null;
    } else if (stage.checkpoints?.length) {
      const a = state.world.missionAnchors[stage.checkpoints[0]];
      state.mission.marker = a ? { x: a.x, y: a.y, radius: 100 } : null;
    } else if (state.mission.chaseVehicleId) {
      const chase = getVehicle(state.mission.chaseVehicleId);
      state.mission.marker = chase ? { x: chase.x, y: chase.y, radius: 100 } : null;
    } else {
      state.mission.marker = null;
    }
  }

  function startMissionStage(index, resetTimer = true) {
    state.mission.stageIndex = index;
    const stage = rebalanceStageForDefaultDifficulty(cloneStage(currentStage()));
    state.mission.stage = stage;
    state.mission.stageLabel = stage?.label || "";
    if (resetTimer) state.mission.timer = stage?.duration || stage?.timeLimit || 0;
    state.mission.runtime = {
      checkpointKeys: stage?.checkpoints ? [...stage.checkpoints] : [],
    };
    clearMissionEntities();
    setMissionMarker(stage);
    if (!stage) return;

    if (stage.spawnVehicle) {
      const anchor = state.world.missionAnchors[stage.spawnVehicle.anchor];
      const spawn = missionPoint(anchor.x + stage.spawnVehicle.offsetX, anchor.y + stage.spawnVehicle.offsetY, 180, 26);
      const vehicle = spawnVehicle("traffic", stage.spawnVehicle.classId, spawn.x, spawn.y, -Math.PI * 0.35, makePaint(stage.spawnVehicle.color, "#534634"));
      state.mission.starterVehicleId = vehicle.id;
      state.mission.marker = { x: vehicle.x, y: vehicle.y, radius: 80 };
    }
    if (stage.type === "destroyTargets") {
      const anchor = state.world.missionAnchors[stage.anchor];
      for (let i = 0; i < stage.targetCount; i += 1) {
        const angle = (Math.PI * 2 * i) / stage.targetCount;
        const distance = 80 + i * 18;
        const point = missionPoint(anchor.x + Math.cos(angle) * distance, anchor.y + Math.sin(angle) * distance, 180, 24);
        spawnTarget(point.x, point.y, i % 2 === 0 ? "crate" : "fuel");
      }
    }
    if (stage.enemyCount) {
      const anchor = state.world.missionAnchors[stage.anchor || "harbor"];
      for (let i = 0; i < stage.enemyCount; i += 1) {
        const point = missionPoint(anchor.x + (rng() - 0.5) * 220, anchor.y + (rng() - 0.5) * 220, 220, 18);
        const hostile = spawnHostile(point.x, point.y);
        hostile.anchorX = anchor.x;
        hostile.anchorY = anchor.y;
      }
    }
    if (stage.spawnChase) {
      const anchor = state.world.missionAnchors[stage.spawnChase.anchor];
      const point = missionPoint(anchor.x, anchor.y, 220, 26);
      const target = spawnVehicle("traffic", stage.spawnChase.classId, point.x, point.y, 0, makePaint(stage.spawnChase.color, "#3f5867"), state.world.carPaths[10]);
      target.state = "missionChase";
      target.health = 150;
      state.mission.chaseVehicleId = target.id;
      const end = state.world.missionAnchors[stage.endAnchor];
      state.mission.chaseEnd = end;
      state.mission.marker = { x: target.x, y: target.y, radius: 100 };
    }
    if (stage.type === "spawnVehicleObjective") {
      const anchor = state.world.missionAnchors[stage.anchor];
      const spawn = missionPoint(anchor.x + 50, anchor.y + 40, 220, 28);
      const vehicle = spawnVehicle("traffic", stage.vehicleClassId, spawn.x, spawn.y, -Math.PI * 0.35, makePaint(stage.vehicleColor, "#4b4030"));
      vehicle.health = 220;
      vehicle.state = "parked";
      state.mission.objectiveVehicleId = vehicle.id;
      state.mission.marker = { x: vehicle.x, y: vehicle.y, radius: 90 };
    }
    if (stage.wanted) {
      state.wanted = Math.max(state.wanted, stage.wanted);
      state.police.lastCrimeTime = state.time;
    }

    const dialogueLines = [];
    if (index === 0 && state.mission.current?.briefing && state.mission.briefedMissionId !== state.mission.current.id) {
      dialogueLines.push(...state.mission.current.briefing);
      state.mission.briefedMissionId = state.mission.current.id;
    }
    if (stage.dialogue?.length) dialogueLines.push(...stage.dialogue);
    if (dialogueLines.length) startDialogue(state.mission.current?.name || "Mission", dialogueLines);
    if (state.mission.current && (state.mode === "playing" || state.save.loaded || state.mission.index > 0 || index > 0)) persistProgress(false);
  }

  function completeMissionStage() {
    const next = state.mission.stageIndex + 1;
    if (next < state.mission.current.stages.length) {
      startMissionStage(next);
      audio.playCash();
      setMissionToast(`STAGE CLEAR: ${state.mission.current.name}`);
    } else {
      state.player.money += state.mission.current.reward;
      audio.playMissionSuccess();
      setMissionToast(`MISSION COMPLETE +$${state.mission.current.reward}`);
      state.mission.index += 1;
      if (state.mission.index >= state.mission.missions.length) {
        state.mission.completed = true;
        state.mission.current = null;
        state.mission.stage = null;
        state.mission.stageLabel = "All missions cleared";
        state.mission.marker = null;
        persistProgress(true);
      } else {
        state.mission.current = state.mission.missions[state.mission.index];
        startMissionStage(0);
      }
    }
  }

  function failMissionStage(reason) {
    state.player.inCarId = null;
    state.player.x = state.player.checkpoint.x;
    state.player.y = state.player.checkpoint.y;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.health = 100;
    state.wanted = 0;
    state.police.pressure = 0;
    state.police.activeRoadblocks = [];
    audio.playMissionFail();
    setMissionToast(`MISSION RESET: ${reason}`);
    startMissionStage(state.mission.stageIndex);
  }

  state.wanted = 0;
  const savedProgress = loadProgress();
  if (savedProgress?.completed) {
    state.mission.index = state.mission.missions.length;
    state.mission.current = null;
    state.mission.stage = null;
    state.mission.stageLabel = "All missions cleared";
    state.mission.completed = true;
    state.mission.marker = null;
  } else if (savedProgress && typeof savedProgress.missionIndex === "number") {
    const missionIndex = clamp(Math.floor(savedProgress.missionIndex), 0, state.mission.missions.length - 1);
    state.mission.index = missionIndex;
    state.mission.current = state.mission.missions[missionIndex];
    const stageIndex = clamp(Math.floor(savedProgress.stageIndex || 0), 0, state.mission.current.stages.length - 1);
    startMissionStage(stageIndex);
  } else {
    startMissionStage(0);
  }

  function playerAnchor() {
    if (state.player.inCarId) {
      const car = getVehicle(state.player.inCarId);
      if (car) return { x: car.x, y: car.y };
    }
    return { x: state.player.x, y: state.player.y };
  }

  function playerSpeed() {
    if (state.player.inCarId) {
      const car = getVehicle(state.player.inCarId);
      if (car) return Math.abs(car.forwardSpeed);
    }
    return magnitude(state.player.vx, state.player.vy);
  }

  function noteCrime(amount, originX = state.player.x, originY = state.player.y) {
    state.wanted = clamp(state.wanted + amount, 0, 5);
    state.police.lastCrimeTime = state.time;
    state.police.searchOrigin = { x: originX, y: originY };
  }

  function damagePlayer(amount) {
    if (amount <= 0) return;
    state.player.health = clamp(state.player.health - amount, 0, 100);
    state.player.lastDamageTime = state.time;
  }

  function fireBullet(team, x, y, angle, inheritedVX = 0, inheritedVY = 0) {
    const ownerCooldown =
      team === "player" ? state.player :
      team === "police" ? null :
      null;
    if (team === "player" && state.time < state.player.nextShotAt) return;
    if (team === "player") {
      state.player.nextShotAt = state.time + CONFIG.shootCooldown;
      state.player.lastShotTime = state.time;
      audio.playShot();
    }
    state.bullets.push({
      id: nextId("bullet"),
      team,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * CONFIG.bulletSpeed + inheritedVX * 0.2,
      vy: Math.sin(angle) * CONFIG.bulletSpeed + inheritedVY * 0.2,
      r: 3,
      life: CONFIG.bulletLifetime,
      damage:
        team === "player" ? CONFIG.playerBulletDamage :
        team === "police" ? CONFIG.policeBulletDamage :
        CONFIG.enemyBulletDamage,
    });
  }

  function nearestVehicleForEntry() {
    let best = null;
    let bestDist = CONFIG.playerEnterRange;
    for (const vehicle of state.vehicles) {
      const dist = Math.hypot(vehicle.x - state.player.x, vehicle.y - state.player.y);
      if (dist < bestDist) {
        best = vehicle;
        bestDist = dist;
      }
    }
    return best;
  }

  function enterVehicle(vehicle) {
    state.player.inCarId = vehicle.id;
    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
    state.player.vx = vehicle.vx;
    state.player.vy = vehicle.vy;
    state.player.facing = vehicle.angle;
  }

  function exitVehicle(vehicle) {
    const offsetAngle = vehicle.angle + Math.PI * 0.5;
    state.player.inCarId = null;
    state.player.x = clamp(vehicle.x + Math.cos(offsetAngle) * (vehicle.r + 22), state.player.r, CONFIG.worldWidth - state.player.r);
    state.player.y = clamp(vehicle.y + Math.sin(offsetAngle) * (vehicle.r + 22), state.player.r, CONFIG.worldHeight - state.player.r);
    state.player.vx = vehicle.vx * 0.35;
    state.player.vy = vehicle.vy * 0.35;
  }

  function updatePlayerOnFoot(dt) {
    const moveX = (input.keys.has("ArrowRight") || input.keys.has("KeyD") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("KeyA") ? 1 : 0);
    const moveY = (input.keys.has("ArrowDown") || input.keys.has("KeyS") ? 1 : 0) - (input.keys.has("ArrowUp") || input.keys.has("KeyW") ? 1 : 0);
    const len = Math.hypot(moveX, moveY) || 1;
    state.player.vx += (moveX / len) * CONFIG.playerAccel * dt;
    state.player.vy += (moveY / len) * CONFIG.playerAccel * dt;
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
    resolveWorldCollision(state.world, state.player);
    if (speed > 8) state.player.facing = Math.atan2(state.player.vy, state.player.vx);
    state.player.animPhase += dt * (6 + speed * 0.05);

    if (input.pressed.has("Space")) {
      fireBullet("player", state.player.x + Math.cos(state.player.facing) * 16, state.player.y + Math.sin(state.player.facing) * 16, state.player.facing, state.player.vx, state.player.vy);
      noteCrime(0.025);
    }
    if (input.pressed.has("KeyE") || input.pressed.has("KeyB")) {
      const vehicle = nearestVehicleForEntry();
      if (vehicle) enterVehicle(vehicle);
    }
  }

  function updatePlayerInCar(dt) {
    const vehicle = getVehicle(state.player.inCarId);
    if (!vehicle) {
      state.player.inCarId = null;
      return;
    }
    const throttle = (input.keys.has("ArrowUp") || input.keys.has("KeyW") ? 1 : 0) - (input.keys.has("ArrowDown") || input.keys.has("KeyS") ? 1 : 0);
    const steer = (input.keys.has("ArrowRight") || input.keys.has("KeyD") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("KeyA") ? 1 : 0);
    applyVehiclePhysics(vehicle, throttle, steer, 0, dt);
    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
    state.player.vx = vehicle.vx;
    state.player.vy = vehicle.vy;
    state.player.facing = vehicle.angle;

    if (input.pressed.has("Space")) {
      fireBullet("player", vehicle.x + Math.cos(vehicle.angle) * (vehicle.length * 0.5 + 8), vehicle.y + Math.sin(vehicle.angle) * (vehicle.length * 0.5 + 8), vehicle.angle, vehicle.vx, vehicle.vy);
      noteCrime(0.03);
    }
    if ((input.pressed.has("KeyE") || input.pressed.has("KeyB")) && Math.abs(vehicle.forwardSpeed) < 42) {
      exitVehicle(vehicle);
    }
  }

  function updateTrafficVehicle(vehicle, dt) {
    if (!vehicle.path || vehicle.state === "parked") return;
    const target = vehicle.path[vehicle.pathIndex % vehicle.path.length];
    const control = driveToward(vehicle, target.x, target.y, vehicle.kind === "police" ? 0.96 : 1);
    applyVehiclePhysics(vehicle, control.throttle, control.steer, control.brake, dt);
    if (control.dist < 60) vehicle.pathIndex = (vehicle.pathIndex + 1) % vehicle.path.length;
  }

  function deployOfficerFromCar(vehicle) {
    if (vehicle.deployedOfficers.length >= 2) return;
    const side = vehicle.deployedOfficers.length === 0 ? -1 : 1;
    const x = vehicle.x + Math.cos(vehicle.angle + side * Math.PI * 0.5) * (vehicle.r + 18);
    const y = vehicle.y + Math.sin(vehicle.angle + side * Math.PI * 0.5) * (vehicle.r + 18);
    const officer = spawnOfficer(x, y, vehicle.id);
    officer.state = state.wanted >= CONFIG.policeTacticalWanted ? "flank" : "pursue";
    officer.lastSeenPlayer = { ...playerAnchor() };
    vehicle.deployedOfficers.push(officer.id);
  }

  function updatePoliceVehicle(vehicle, dt) {
    const anchor = playerAnchor();
    const dir = magnitude(state.player.vx, state.player.vy) > 2 ? { x: state.player.vx / magnitude(state.player.vx, state.player.vy), y: state.player.vy / magnitude(state.player.vx, state.player.vy) } : { x: Math.cos(state.player.facing), y: Math.sin(state.player.facing) };
    const canSee = !lineBlocked(state.world, vehicle.x, vehicle.y, anchor.x, anchor.y);
    const distance = Math.hypot(anchor.x - vehicle.x, anchor.y - vehicle.y);

    if (state.wanted < 0.15) {
      vehicle.state = "patrol";
      vehicle.assignedRoadblock = null;
      updateTrafficVehicle(vehicle, dt);
      return;
    }

    if (canSee) vehicle.lastSeenPlayer = { x: anchor.x, y: anchor.y, time: state.time };

    if (state.wanted >= CONFIG.policeRoadblockWanted && !vehicle.assignedRoadblock && state.police.activeRoadblocks.length < 2) {
      const spot = pickRoadblockSpot(state.world, anchor.x, anchor.y, dir.x, dir.y);
      if (spot) {
        vehicle.assignedRoadblock = spot;
        state.police.activeRoadblocks.push(spot);
        vehicle.state = "roadblock";
      }
    }

    if (vehicle.state === "roadblock" && vehicle.assignedRoadblock) {
      const control = driveToward(vehicle, vehicle.assignedRoadblock.x, vehicle.assignedRoadblock.y, 0.8);
      applyVehiclePhysics(vehicle, control.throttle, control.steer, control.brake, dt);
      if (control.dist < 48) {
        vehicle.forwardSpeed *= 0.6;
        if (vehicle.deployedOfficers.length < 1 && distance < 320) deployOfficerFromCar(vehicle);
      }
      if (distance > 1100) vehicle.state = "search";
      return;
    }

    if (state.wanted >= CONFIG.policeTacticalWanted && distance < 320 && vehicle.deployedOfficers.length < 1) {
      deployOfficerFromCar(vehicle);
      vehicle.state = "contain";
    }

    if (vehicle.state === "contain" && vehicle.deployedOfficers.length) {
      const node = nearestNavNode(state.world, anchor.x + dir.x * 160, anchor.y + dir.y * 160) || anchor;
      const navTarget = ensureNavRoute(vehicle, node.x, node.y, 0.8);
      const control = driveToward(vehicle, navTarget.x, navTarget.y, 0.82);
      applyVehiclePhysics(vehicle, control.throttle, control.steer, control.brake, dt);
      advanceNavPoint(vehicle, 54);
      return;
    }

    if (canSee || distance < 760) {
      vehicle.state = "intercept";
      const interceptNode = nearestNavNode(state.world, anchor.x + dir.x * 220, anchor.y + dir.y * 220) || anchor;
      const navTarget = ensureNavRoute(vehicle, interceptNode.x, interceptNode.y, 0.65);
      const control = driveToward(vehicle, navTarget.x, navTarget.y, 1.05);
      if (distance < 160) control.brake = Math.max(control.brake, 0.8);
      applyVehiclePhysics(vehicle, control.throttle, control.steer, control.brake, dt);
      advanceNavPoint(vehicle, 52);
      return;
    }

    vehicle.state = "search";
    const search = vehicle.lastSeenPlayer || state.police.searchOrigin || anchor;
    const node = nearestNavNode(state.world, search.x, search.y) || search;
    const navTarget = ensureNavRoute(vehicle, node.x, node.y, 1.1);
    const control = driveToward(vehicle, navTarget.x, navTarget.y, 0.9);
    applyVehiclePhysics(vehicle, control.throttle, control.steer, control.brake, dt);
    advanceNavPoint(vehicle, 56);
  }

  function updateCivilian(civilian, dt) {
    if (civilian.stunned > 0) {
      civilian.stunned = Math.max(0, civilian.stunned - dt);
      civilian.vx *= Math.exp(-5 * dt);
      civilian.vy *= Math.exp(-5 * dt);
    } else {
      let panicVector = null;
      if (civilian.panic > 0) {
        const threats = [...state.police.officers, ...state.hostiles];
        let nearest = null;
        let nearestDist = Infinity;
        for (const threat of threats) {
          const dist = Math.hypot(threat.x - civilian.x, threat.y - civilian.y);
          if (dist < nearestDist) {
            nearest = threat;
            nearestDist = dist;
          }
        }
        if (nearest) {
          panicVector = { x: civilian.x - nearest.x, y: civilian.y - nearest.y };
        }
        civilian.panic = Math.max(0, civilian.panic - dt);
      }
      if (!civilian.targetNode || Math.hypot(civilian.targetNode.x - civilian.x, civilian.targetNode.y - civilian.y) < 34) {
        civilian.targetNode = state.world.navNodes[Math.floor(rng() * state.world.navNodes.length)];
      }
      let dx = civilian.targetNode.x - civilian.x;
      let dy = civilian.targetNode.y - civilian.y;
      if (panicVector) {
        dx = panicVector.x;
        dy = panicVector.y;
      }
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;
      const maxSpeed = civilian.maxSpeed + (panicVector ? 55 : 0);
      civilian.vx += dx * 180 * dt;
      civilian.vy += dy * 180 * dt;
      civilian.vx *= Math.exp(-3.7 * dt);
      civilian.vy *= Math.exp(-3.7 * dt);
      const speed = magnitude(civilian.vx, civilian.vy);
      if (speed > maxSpeed) {
        const ratio = maxSpeed / speed;
        civilian.vx *= ratio;
        civilian.vy *= ratio;
      }
    }
    civilian.x += civilian.vx * dt;
    civilian.y += civilian.vy * dt;
    civilian.animPhase += dt * (6 + magnitude(civilian.vx, civilian.vy) * 0.06);
    civilian.x = clamp(civilian.x, civilian.r, CONFIG.worldWidth - civilian.r);
    civilian.y = clamp(civilian.y, civilian.r, CONFIG.worldHeight - civilian.r);
    resolveWorldCollision(state.world, civilian);
  }

  function updateHostile(hostile, dt) {
    hostile.shootCooldown = Math.max(0, hostile.shootCooldown - dt);
    const anchor = playerAnchor();
    const distance = Math.hypot(anchor.x - hostile.x, anchor.y - hostile.y);
    const los = !lineBlocked(state.world, hostile.x, hostile.y, anchor.x, anchor.y);
    let tx = hostile.anchorX;
    let ty = hostile.anchorY;
    if (distance < 340) {
      hostile.state = "attack";
      tx = anchor.x + Math.cos(state.time + hostile.id) * 60;
      ty = anchor.y + Math.sin(state.time * 1.3 + hostile.id) * 60;
      hostile.facing = Math.atan2(anchor.y - hostile.y, anchor.x - hostile.x);
      if (los && distance < 220 && hostile.shootCooldown <= 0) {
        fireBullet("enemy", hostile.x + Math.cos(hostile.facing) * 14, hostile.y + Math.sin(hostile.facing) * 14, hostile.facing);
        hostile.shootCooldown = CONFIG.enemyShootCooldown;
      }
    }
    const dx = tx - hostile.x;
    const dy = ty - hostile.y;
    const dist = Math.hypot(dx, dy) || 1;
    hostile.vx += (dx / dist) * 430 * dt;
    hostile.vy += (dy / dist) * 430 * dt;
    hostile.vx *= Math.exp(-4.3 * dt);
    hostile.vy *= Math.exp(-4.3 * dt);
    const speed = magnitude(hostile.vx, hostile.vy);
    if (speed > 148) {
      hostile.vx *= 148 / speed;
      hostile.vy *= 148 / speed;
    }
    hostile.x += hostile.vx * dt;
    hostile.y += hostile.vy * dt;
    hostile.animPhase += dt * (6 + speed * 0.06);
    resolveWorldCollision(state.world, hostile);
  }

  function updateOfficer(officer, dt) {
    officer.shootCooldown = Math.max(0, officer.shootCooldown - dt);
    officer.stateTimer += dt;
    const anchor = playerAnchor();
    const distToPlayer = Math.hypot(anchor.x - officer.x, anchor.y - officer.y);
    const los = !lineBlocked(state.world, officer.x, officer.y, anchor.x, anchor.y);
    if (los) {
      officer.lastSeenPlayer = { x: anchor.x, y: anchor.y, time: state.time };
      officer.searchTimer = CONFIG.policeSearchDuration;
    } else {
      officer.searchTimer -= dt;
    }
    if (state.wanted < 0.2 && officer.searchTimer <= 0) {
      const car = getVehicle(officer.carId);
      if (car) {
        officer.state = "return";
        if (Math.hypot(car.x - officer.x, car.y - officer.y) < 32) {
          state.police.officers = state.police.officers.filter((value) => value.id !== officer.id);
          car.deployedOfficers = car.deployedOfficers.filter((id) => id !== officer.id);
          return;
        }
      }
    } else if (state.wanted >= CONFIG.policeTacticalWanted && officer.stateTimer > 2.4) {
      officer.state = "flank";
    } else if (los) {
      officer.state = "pursue";
    } else {
      officer.state = "search";
    }

    let targetX = anchor.x;
    let targetY = anchor.y;
    if (officer.state === "flank") {
      const node = nearestNavNode(state.world, anchor.x + officer.flankSide * 150, anchor.y + 110) || anchor;
      targetX = node.x;
      targetY = node.y;
    } else if (officer.state === "search" && officer.lastSeenPlayer) {
      const node = nearestNavNode(state.world, officer.lastSeenPlayer.x, officer.lastSeenPlayer.y) || officer.lastSeenPlayer;
      targetX = node.x;
      targetY = node.y;
    } else if (officer.state === "return") {
      const car = getVehicle(officer.carId);
      if (car) {
        targetX = car.x;
        targetY = car.y;
      }
    }

    if (!los || officer.state === "flank" || officer.state === "return") {
      const navTarget = ensureNavRoute(officer, targetX, targetY, 0.6);
      targetX = navTarget.x;
      targetY = navTarget.y;
      advanceNavPoint(officer, 30);
    }

    const dx = targetX - officer.x;
    const dy = targetY - officer.y;
    const dist = Math.hypot(dx, dy) || 1;
    officer.vx += (dx / dist) * 560 * dt;
    officer.vy += (dy / dist) * 560 * dt;
    officer.vx *= Math.exp(-4.7 * dt);
    officer.vy *= Math.exp(-4.7 * dt);
    const speed = magnitude(officer.vx, officer.vy);
    if (speed > CONFIG.policeOfficerMaxSpeed) {
      officer.vx *= CONFIG.policeOfficerMaxSpeed / speed;
      officer.vy *= CONFIG.policeOfficerMaxSpeed / speed;
    }
    officer.x += officer.vx * dt;
    officer.y += officer.vy * dt;
    officer.animPhase += dt * (6.2 + speed * 0.06);
    officer.facing = Math.atan2(anchor.y - officer.y, anchor.x - officer.x);
    resolveWorldCollision(state.world, officer);

    if (los && distToPlayer < 200 && officer.shootCooldown <= 0) {
      fireBullet("police", officer.x + Math.cos(officer.facing) * 14, officer.y + Math.sin(officer.facing) * 14, officer.facing);
      officer.shootCooldown = CONFIG.officerShootCooldown;
    }
    if (distToPlayer < 34) {
      state.police.pressure = clamp(state.police.pressure + dt * CONFIG.policeContactPressureRate, 0, 1);
      if (!state.player.inCarId) damagePlayer(CONFIG.policeContactDamagePerSecond * dt);
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
      if (bullet.life <= 0 || bullet.x < -40 || bullet.y < -40 || bullet.x > CONFIG.worldWidth + 40 || bullet.y > CONFIG.worldHeight + 40) {
        state.bullets.splice(i, 1);
        continue;
      }
      let consumed = false;
      for (const building of state.world.buildings) {
        if (bullet.x >= building.x && bullet.x <= building.x + building.w && bullet.y >= building.y && bullet.y <= building.y + building.h) {
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const target of state.mission.targets) {
          if (Math.hypot(target.x - bullet.x, target.y - bullet.y) <= target.r + bullet.r) {
            if (bullet.team === "player") target.health -= bullet.damage > 20 ? 1 : 0.5;
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && bullet.team !== "player") {
        if (Math.hypot(state.player.x - bullet.x, state.player.y - bullet.y) <= state.player.r + bullet.r && !state.player.inCarId) {
          damagePlayer(bullet.damage);
          consumed = true;
        }
      }
      if (!consumed && bullet.team === "player") {
        for (const hostile of state.hostiles) {
          if (Math.hypot(hostile.x - bullet.x, hostile.y - bullet.y) <= hostile.r + bullet.r) {
            hostile.health -= bullet.damage;
            hostile.state = "attack";
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && bullet.team === "player") {
        for (const officer of state.police.officers) {
          if (Math.hypot(officer.x - bullet.x, officer.y - bullet.y) <= officer.r + bullet.r) {
            officer.health -= bullet.damage;
            officer.state = "pursue";
            noteCrime(0.22, officer.x, officer.y);
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && bullet.team === "player") {
        for (const vehicle of state.vehicles) {
          if (Math.hypot(vehicle.x - bullet.x, vehicle.y - bullet.y) <= vehicle.r + bullet.r) {
            vehicle.health -= 10;
            if (vehicle.kind === "police") noteCrime(0.1, vehicle.x, vehicle.y);
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && bullet.team === "player") {
        for (const civilian of state.civilians) {
          if (Math.hypot(civilian.x - bullet.x, civilian.y - bullet.y) <= civilian.r + bullet.r) {
            civilian.panic = 4;
            civilian.stunned = 1.8;
            noteCrime(0.3, civilian.x, civilian.y);
            consumed = true;
            break;
          }
        }
      }
      if (consumed) state.bullets.splice(i, 1);
    }
    state.hostiles = state.hostiles.filter((hostile) => hostile.health > 0);
    state.police.officers = state.police.officers.filter((officer) => officer.health > 0);
    state.mission.targets = state.mission.targets.filter((target) => target.health > 0);
  }

  function handleCollisions() {
    for (let i = 0; i < state.vehicles.length; i += 1) {
      for (let j = i + 1; j < state.vehicles.length; j += 1) resolveDynamicCircle(state.vehicles[i], state.vehicles[j], 0.12);
    }
    for (const vehicle of state.vehicles) {
      for (const civilian of state.civilians) {
        const impact = resolveDynamicCircle(vehicle, civilian, 0.16);
        if (impact > 40) civilian.panic = 3;
        if (impact > 84) civilian.stunned = 2.6;
        if (state.player.inCarId === vehicle.id && impact > 76) {
          noteCrime(0.5, civilian.x, civilian.y);
          damagePlayer(impact * CONFIG.playerVehicleCrashDamageScale);
        }
      }
      for (const officer of state.police.officers) {
        const impact = resolveDynamicCircle(vehicle, officer, 0.14);
        if (impact > 70) {
          officer.health -= impact * 0.4;
          if (state.player.inCarId === vehicle.id) noteCrime(0.62, officer.x, officer.y);
        }
      }
    }
    if (!state.player.inCarId) {
      for (const vehicle of state.vehicles) {
        const impact = resolveDynamicCircle(vehicle, state.player, 0.12);
        if (impact > 44) damagePlayer(impact * CONFIG.playerCrashDamageScale);
      }
      for (const officer of state.police.officers) resolveDynamicCircle(state.player, officer, 0.18);
      for (const hostile of state.hostiles) resolveDynamicCircle(state.player, hostile, 0.18);
    }
  }

  function updateWanted(dt) {
    if (state.time - state.police.lastCrimeTime > CONFIG.wantedDecayDelay) state.wanted = Math.max(0, state.wanted - dt * CONFIG.wantedDecayRate);
    let nearestPolice = Infinity;
    const anchor = playerAnchor();
    for (const vehicle of state.vehicles) if (vehicle.kind === "police") nearestPolice = Math.min(nearestPolice, Math.hypot(vehicle.x - anchor.x, vehicle.y - anchor.y));
    for (const officer of state.police.officers) nearestPolice = Math.min(nearestPolice, Math.hypot(officer.x - anchor.x, officer.y - anchor.y));
    if (state.wanted > 0.15) {
      if (nearestPolice < 120) state.police.pressure = clamp(state.police.pressure + dt * (CONFIG.policePressureNearRate + state.wanted * CONFIG.policePressureWantedScale), 0, 1);
      else state.police.pressure = Math.max(0, state.police.pressure - dt * CONFIG.policePressureFarDecay);
    } else {
      state.police.pressure = Math.max(0, state.police.pressure - dt * CONFIG.policePressureIdleDecay);
    }
    if (state.police.pressure >= 1 || state.player.health <= 0) failMissionStage(state.player.health <= 0 ? "You were wasted." : "Busted by tactical police.");
  }

  function updatePoliceReinforcements() {
    if (state.wanted < CONFIG.policeReinforcementWantedThreshold) return;
    if (state.time - state.police.lastReinforcementTime < CONFIG.policeReinforcementCooldown) return;
    const anchor = playerAnchor();
    const district = findDistrict(state.world, anchor.x, anchor.y);
    const nearbyPoliceCars = state.vehicles.filter((vehicle) => vehicle.kind === "police" && Math.hypot(vehicle.x - anchor.x, vehicle.y - anchor.y) < 980).length;
    const desiredCars = district.id === "downtown" ? 2 : 1;
    if (nearbyPoliceCars >= desiredCars + Math.floor(state.wanted * 0.25)) return;
    const spawnNode = nearestNavNode(state.world, anchor.x + 760, anchor.y + 760) || state.world.navNodes[0];
    spawnPoliceReinforcement(spawnNode.x, spawnNode.y, spawnNode);
    state.police.lastReinforcementTime = state.time;
  }

  function updateHealthRegen(dt) {
    const speed = playerSpeed();
    const moving = speed > 8 || input.keys.has("ArrowUp") || input.keys.has("ArrowDown") || input.keys.has("ArrowLeft") || input.keys.has("ArrowRight") || input.keys.has("KeyW") || input.keys.has("KeyA") || input.keys.has("KeyS") || input.keys.has("KeyD");
    const cooldownOver = state.time - state.player.lastDamageTime > CONFIG.healthRegenDelay;
    const recentlyShot = state.time - state.player.lastShotTime < 1.6;
    if (!moving && cooldownOver && !recentlyShot) state.player.health = Math.min(100, state.player.health + CONFIG.healthRegenRate * dt);
  }

  function updateDialogue(dt) {
    if (!state.dialogue.active) return;
    state.dialogue.timer -= dt;
    if (state.dialogue.timer <= 0) advanceDialogue();
  }

  function updateMission(dt) {
    const stage = state.mission.stage;
    if (!stage) return;
    if (state.mission.toast) {
      state.mission.toast.ttl -= dt;
      if (state.mission.toast.ttl <= 0) state.mission.toast = null;
    }
    if (state.save.toast) {
      state.save.toast.ttl -= dt;
      if (state.save.toast.ttl <= 0) state.save.toast = null;
    }
    if (stage.duration || stage.timeLimit) {
      state.mission.timer -= dt;
      if (state.mission.timer <= 0) failMissionStage("Time expired.");
    }
    const anchor = stage.anchor ? state.world.missionAnchors[stage.anchor] : null;
    if (stage.type === "meet" && anchor && Math.hypot(state.player.x - anchor.x, state.player.y - anchor.y) < stage.radius) {
      if (stage.checkpoint) setCheckpoint(stage.anchor);
      completeMissionStage();
    } else if (stage.type === "enterVehicle") {
      const vehicle = getVehicle(state.mission.starterVehicleId);
      if (vehicle) state.mission.marker = { x: vehicle.x, y: vehicle.y, radius: 80 };
      if (state.player.inCarId === vehicle?.id) completeMissionStage();
    } else if (stage.type === "spawnVehicleObjective") {
      const vehicle = getVehicle(state.mission.objectiveVehicleId);
      if (vehicle) state.mission.marker = { x: vehicle.x, y: vehicle.y, radius: 90 };
      if (state.player.inCarId && vehicle && state.player.inCarId === vehicle.id) completeMissionStage();
    } else if (stage.type === "driveTo" && anchor && state.player.inCarId && Math.hypot(playerAnchor().x - anchor.x, playerAnchor().y - anchor.y) < stage.radius) {
      if (stage.checkpoint) setCheckpoint(stage.anchor);
      completeMissionStage();
    } else if (stage.type === "destroyTargets" && state.mission.targets.length === 0) {
      completeMissionStage();
    } else if (stage.type === "escapeWanted" && anchor && Math.hypot(state.player.x - anchor.x, state.player.y - anchor.y) < stage.radius && state.wanted <= stage.targetWanted) {
      if (stage.checkpoint) setCheckpoint(stage.anchor);
      completeMissionStage();
    } else if (stage.type === "collectPackage" && anchor && Math.hypot(state.player.x - anchor.x, state.player.y - anchor.y) < stage.radius) {
      state.player.hasPackage = true;
      if (stage.checkpoint) setCheckpoint(stage.anchor);
      completeMissionStage();
    } else if (stage.type === "timedRoute") {
      const checkpointKey = state.mission.runtime.checkpointKeys[0];
      const cp = state.world.missionAnchors[checkpointKey];
      if (cp) state.mission.marker = { x: cp.x, y: cp.y, radius: 110 };
      if (cp && Math.hypot(playerAnchor().x - cp.x, playerAnchor().y - cp.y) < 110) {
        state.mission.runtime.checkpointKeys.shift();
        if (!state.mission.runtime.checkpointKeys.length) completeMissionStage();
      }
    } else if (stage.type === "chaseVehicle") {
      const chase = getVehicle(state.mission.chaseVehicleId);
      if (!chase || chase.health <= 0 || (state.mission.chaseEnd && Math.hypot(chase.x - state.mission.chaseEnd.x, chase.y - state.mission.chaseEnd.y) < 80)) {
        completeMissionStage();
      } else {
        state.mission.marker = { x: chase.x, y: chase.y, radius: 90 };
      }
    } else if (stage.type === "defeatEnemies" && state.hostiles.length === 0) {
      completeMissionStage();
    } else if (stage.type === "survive" && state.mission.timer <= 0) {
      completeMissionStage();
    } else if (stage.type === "stealVehicle" && anchor) {
      const target = state.vehicles.find((vehicle) => vehicle.kind === "police" && Math.hypot(vehicle.x - anchor.x, vehicle.y - anchor.y) < 220);
      if (target) state.mission.marker = { x: target.x, y: target.y, radius: stage.radius };
      if (state.player.inCarId && target && state.player.inCarId === target.id) completeMissionStage();
    }
  }

  function updateCamera(dt) {
    const anchor = playerAnchor();
    const targetX = clamp(anchor.x - state.camera.width * 0.5, 0, CONFIG.worldWidth - state.camera.width);
    const targetY = clamp(anchor.y - state.camera.height * 0.5, 0, CONFIG.worldHeight - state.camera.height);
    state.camera.x += (targetX - state.camera.x) * clamp(dt * 6.8, 0, 1);
    state.camera.y += (targetY - state.camera.y) * clamp(dt * 6.8, 0, 1);
  }

  function updateHud() {
    const district = findDistrict(state.world, state.player.x, state.player.y);
    hudMode.textContent = state.player.inCarId ? "IN CAR" : "ON FOOT";
    hudHealth.textContent = `HEALTH ${Math.round(state.player.health)}`;
    hudWanted.textContent = `WANTED ${state.wanted.toFixed(1)}`;
    hudSpeed.textContent = `SPEED ${Math.round(playerSpeed())}`;
    hudMoney.textContent = `CASH $${Math.round(state.player.money)}`;
    hudTask.textContent = state.mission.current ? `${district.name} | ${state.mission.current.name}: ${state.mission.stageLabel}` : `${district.name} | ALL MISSIONS CLEARED`;
  }

  function updateGame(dt) {
    const simDt = dt * CONFIG.paceScale;
    state.time += simDt;
    if (state.player.inCarId) updatePlayerInCar(simDt);
    else updatePlayerOnFoot(simDt);

    for (const vehicle of state.vehicles) {
      if (vehicle.id === state.player.inCarId) continue;
      if (vehicle.kind === "police") updatePoliceVehicle(vehicle, simDt);
      else if (vehicle.state === "missionChase" && state.mission.chaseEnd) {
        const control = driveToward(vehicle, state.mission.chaseEnd.x, state.mission.chaseEnd.y, 1);
        applyVehiclePhysics(vehicle, control.throttle, control.steer, control.brake, simDt);
      } else updateTrafficVehicle(vehicle, simDt);
    }

    for (const civilian of state.civilians) updateCivilian(civilian, simDt);
    for (const hostile of state.hostiles) updateHostile(hostile, simDt);
    for (const officer of [...state.police.officers]) updateOfficer(officer, simDt);
    updateBullets(simDt);
    handleCollisions();
    updateMission(simDt);
    updateWanted(simDt);
    updatePoliceReinforcements();
    updateHealthRegen(simDt);
    updateCamera(simDt);
    updateHud();
    audio.update({ speed: playerSpeed(), wanted: state.wanted, districtId: findDistrict(state.world, state.player.x, state.player.y).id });
    input.pressed.clear();
  }

  function render() {
    renderGame(ctx, canvas, state, assets);
  }

  function resizeAndRender() {
    resizeCanvas();
    render();
  }

  function unlockAudioAndStart() {
    audio.unlock();
    state.mode = "playing";
    startOverlay.classList.add("hidden");
    if (!state.save.exists && state.mission.current) persistProgress(false);
    if (state.save.exists) setSaveToast(state.save.loaded ? "SAVE RESTORED" : "SAVE READY");
    render();
  }

  function handleKeyDown(event) {
    if (state.dialogue.active && ["Enter", "Space"].includes(event.code)) {
      advanceDialogue();
      event.preventDefault();
      return;
    }
    if (!input.keys.has(event.code)) input.pressed.add(event.code);
    input.keys.add(event.code);
    audio.unlock();
    if (event.code === "Enter" && state.mode === "menu") unlockAudioAndStart();
    if (event.code === "KeyP" && state.mode === "playing") state.paused = !state.paused;
    if (event.code === "KeyR" && state.mode === "playing") failMissionStage("Checkpoint reset.");
    if (event.code === "KeyF") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  }

  function handleKeyUp(event) {
    input.keys.delete(event.code);
  }

  let lastFrame = performance.now();
  function loop(now) {
    const delta = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (state.mode === "playing" && !state.paused) {
      state.accumulator += delta;
      while (state.accumulator >= CONFIG.fixedDt) {
        if (state.dialogue.active) {
          updateDialogue(CONFIG.fixedDt * CONFIG.paceScale);
          input.pressed.clear();
        } else {
          updateGame(CONFIG.fixedDt);
        }
        state.accumulator -= CONFIG.fixedDt;
      }
    }
    render();
    requestAnimationFrame(loop);
  }

  window.render_game_to_text = () => {
    const anchor = playerAnchor();
    return JSON.stringify({
      mode: state.mode,
      paused: state.paused,
      coordinateSystem: {
        origin: "top-left of world",
        xAxis: "increases right",
        yAxis: "increases down",
        units: "world pixels",
      },
      world: { width: state.world.width, height: state.world.height, district: findDistrict(state.world, state.player.x, state.player.y).name },
      timeSeconds: Number(state.time.toFixed(2)),
      camera: { x: Number(state.camera.x.toFixed(1)), y: Number(state.camera.y.toFixed(1)), width: state.camera.width, height: state.camera.height },
      player: {
        onFoot: !state.player.inCarId,
        x: Number(state.player.x.toFixed(1)),
        y: Number(state.player.y.toFixed(1)),
        vx: Number(state.player.vx.toFixed(1)),
        vy: Number(state.player.vy.toFixed(1)),
        health: Number(state.player.health.toFixed(1)),
        money: Math.round(state.player.money),
        wanted: Number(state.wanted.toFixed(2)),
      },
      mission: state.mission.current ? {
        id: state.mission.current.id,
        name: state.mission.current.name,
        stageIndex: state.mission.stageIndex,
        stageType: state.mission.stage?.type,
        stageLabel: state.mission.stageLabel,
        timer: Number((state.mission.timer || 0).toFixed(1)),
        marker: state.mission.marker ? { x: Number(state.mission.marker.x.toFixed(1)), y: Number(state.mission.marker.y.toFixed(1)), radius: state.mission.marker.radius } : null,
        targetsRemaining: state.mission.targets.length,
        routeRemaining: state.mission.runtime.checkpointKeys || [],
        objectiveVehicleId: state.mission.objectiveVehicleId,
      } : { complete: true },
      dialogue: state.dialogue.active ? {
        title: state.dialogue.title,
        index: state.dialogue.index,
        speaker: state.dialogue.queue[state.dialogue.index]?.speaker,
        text: state.dialogue.queue[state.dialogue.index]?.text,
      } : null,
      save: {
        exists: state.save.exists,
        loaded: state.save.loaded,
        lastSavedAt: state.save.lastSavedAt,
      },
      police: {
        pressure: Number(state.police.pressure.toFixed(2)),
        officers: state.police.officers.slice(0, 8).map((officer) => ({ x: Number(officer.x.toFixed(1)), y: Number(officer.y.toFixed(1)), state: officer.state })),
        cars: state.vehicles.filter((vehicle) => vehicle.kind === "police").slice(0, 8).map((vehicle) => ({ x: Number(vehicle.x.toFixed(1)), y: Number(vehicle.y.toFixed(1)), state: vehicle.state })),
      },
      hostiles: state.hostiles.slice(0, 8).map((hostile) => ({ x: Number(hostile.x.toFixed(1)), y: Number(hostile.y.toFixed(1)), health: Number(hostile.health.toFixed(1)) })),
      visibleHazards: state.mission.targets.slice(0, 8).map((target) => ({ x: Number(target.x.toFixed(1)), y: Number(target.y.toFixed(1)), kind: target.kind })),
      bulletsActive: state.bullets.length,
    });
  };

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      if (state.mode === "playing" && !state.paused) {
        if (state.dialogue.active) updateDialogue(CONFIG.fixedDt * CONFIG.paceScale);
        else updateGame(CONFIG.fixedDt);
      }
    }
    render();
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("resize", resizeAndRender);
  window.addEventListener("fullscreenchange", resizeAndRender);
  startButton.addEventListener("click", unlockAudioAndStart);
  window.clearSavedProgress = clearSavedProgress;

  document.querySelector(".panel ul").innerHTML = START_SCREEN_LINES.map((line) => `<li>${line}</li>`).join("");
  if (state.save.exists) startButton.textContent = "Continue Operation";
  resizeCanvas();
  updateHud();
  render();
  requestAnimationFrame(loop);
}
