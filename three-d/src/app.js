import * as THREE from "../../node_modules/three/build/three.module.js";
import { GLTFLoader } from "../../node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "../../node_modules/three/examples/jsm/utils/SkeletonUtils.js";

import { ASSET_MANIFEST, resolveAssetUrl } from "./asset-manifest.js";
import { createPrototypeLayout } from "./layout.js";
import { chooseAnimationName, clampPlayerToWorld, selectCharacterClip, updatePlayerState } from "./player.js";
import { createTextSnapshot } from "./render-state.js";

const FIXED_DT = 1 / 60;
const PLAYER_RADIUS = 3.2;

function makeFallbackBox(width, height, depth, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function resize(renderer, camera, container) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function cloneAsset(gltf) {
  if (!gltf?.scene) return null;
  return gltf.scene.getObjectByProperty("isSkinnedMesh", true) ? cloneSkinned(gltf.scene) : gltf.scene.clone(true);
}

function fitObjectToSize(object, { width, depth, height, size }) {
  const bounds = new THREE.Box3().setFromObject(object);
  const current = bounds.getSize(new THREE.Vector3());
  const targets = [
    width && current.x ? width / current.x : null,
    depth && current.z ? depth / current.z : null,
    height && current.y ? height / current.y : null,
    size && Math.max(current.x, current.z, current.y) ? size / Math.max(current.x, current.z, current.y) : null,
  ].filter(Boolean);
  const scale = targets.length ? Math.min(...targets) : 1;
  object.scale.multiplyScalar(scale);

  const scaledBounds = new THREE.Box3().setFromObject(object);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  const min = scaledBounds.min;
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= min.y;
}

function markShadowCasters(root) {
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}

function addSky(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(340, 40, 32),
    new THREE.MeshBasicMaterial({ color: 0xbad7ef, side: THREE.BackSide }),
  );
  scene.add(sky);
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff1d3, 0x4e6b4b, 1.9));

  const sun = new THREE.DirectionalLight(0xfff3cf, 2.9);
  sun.position.set(80, 120, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  scene.add(sun);
}

function addGround(scene, world) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(world.width + 60, world.depth + 60),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(world.groundColor), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(26, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a8171, roughness: 0.88 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.02, 0);
  plaza.receiveShadow = true;
  scene.add(plaza);
}

function addRoadStripe(scene, road) {
  const isVertical = Math.abs(Math.sin(road.rotationY)) > 0.7;
  const stripeLength = isVertical ? road.depth * 0.65 : road.width * 0.65;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(isVertical ? 1.2 : stripeLength, 0.04, isVertical ? stripeLength : 1.2),
    new THREE.MeshStandardMaterial({ color: 0xf0df9b, emissive: 0x2a220e }),
  );
  stripe.position.set(road.position.x, 0.18, road.position.z);
  scene.add(stripe);
}

function addRoad(scene, gltf, road) {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(road.width, 0.18, road.depth),
    new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.9, metalness: 0.08 }),
  );
  base.position.set(road.position.x, 0.08, road.position.z);
  base.receiveShadow = true;
  scene.add(base);
  addRoadStripe(scene, road);

  if (!gltf) return;
  const root = cloneAsset(gltf);
  fitObjectToSize(root, { width: road.width, depth: road.depth, height: road.height || 2.2 });
  root.rotation.y = road.rotationY;
  root.position.set(road.position.x, 0.18, road.position.z);
  markShadowCasters(root);
  scene.add(root);
}

function createStaticPlacement(scene, gltf, item, color) {
  const root = gltf ? cloneAsset(gltf) : makeFallbackBox(item.width || item.size || 4, item.height || item.size || 4, item.depth || item.size || 4, color);
  if (!root) return null;
  fitObjectToSize(root, item);
  markShadowCasters(root);
  root.rotation.y = item.rotationY || item.heading || 0;
  root.position.set(item.position.x, item.position.y || 0, item.position.z);
  scene.add(root);
  return root;
}

function buildAnimationSet(animations) {
  const clipNames = animations.map((clip) => clip.name);
  const idleName = selectCharacterClip(clipNames, "idle");
  const walkName = selectCharacterClip(clipNames, "walk");
  const runName = selectCharacterClip(clipNames, "run");
  return {
    idle: animations.find((clip) => clip.name === idleName) || null,
    walk: animations.find((clip) => clip.name === walkName) || null,
    run: animations.find((clip) => clip.name === runName) || null,
  };
}

function createCharacter(scene, gltf, config, fallbackColor = 0x7b8690) {
  const root = gltf ? cloneAsset(gltf) : makeFallbackBox(2.4, 7.6, 2.4, fallbackColor);
  fitObjectToSize(root, { height: 10 });
  markShadowCasters(root);

  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 3.1, 0.24, 20),
    new THREE.MeshStandardMaterial({
      color: fallbackColor,
      emissive: fallbackColor,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.88,
    }),
  );
  marker.position.set(0, 0.12, 0);
  marker.receiveShadow = true;
  root.add(marker);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 14, 12),
    new THREE.MeshStandardMaterial({
      color: fallbackColor,
      emissive: fallbackColor,
      emissiveIntensity: 0.4,
    }),
  );
  beacon.position.set(0, 6.5, 0);
  beacon.castShadow = true;
  root.add(beacon);

  root.position.set(config.position.x, 0, config.position.z);
  root.rotation.y = config.heading || config.rotationY || 0;
  scene.add(root);

  const mixer = gltf ? new THREE.AnimationMixer(root) : null;
  const actions = {};
  if (gltf?.animations?.length) {
    const animationSet = buildAnimationSet(gltf.animations);
    for (const [key, clip] of Object.entries(animationSet)) {
      if (clip) actions[key] = mixer.clipAction(clip);
    }
  }
  const defaultAction = actions.idle || actions.walk || actions.run || null;
  defaultAction?.play();

  return {
    root,
    mixer,
    actions,
    activeAnimation: defaultAction ? Object.keys(actions).find((key) => actions[key] === defaultAction) || "idle" : null,
    state: {
      position: new THREE.Vector3(config.position.x, 0, config.position.z),
      velocity: new THREE.Vector3(),
      speed: 0,
      facing: config.heading || config.rotationY || 0,
      animationState: "idle",
      path: config.path || null,
      pathIndex: 0,
      originX: config.position.x,
      originZ: config.position.z,
      patrolRadius: config.patrolRadius || 0,
      phase: Math.random() * Math.PI * 2,
    },
  };
}

function setCharacterAnimation(character, nextState) {
  if (!character.actions[nextState] || character.activeAnimation === nextState) return;
  const current = character.activeAnimation ? character.actions[character.activeAnimation] : null;
  const next = character.actions[nextState];
  current?.fadeOut(0.2);
  next.reset().fadeIn(0.2).play();
  character.activeAnimation = nextState;
}

async function loadAssetCatalog(onStatus) {
  const loader = new GLTFLoader();
  const catalog = {};
  const layout = createPrototypeLayout();
  const required = {
    buildings: new Set(layout.buildings.map((item) => item.assetId)),
    roads: new Set(layout.roads.map((item) => item.assetId)),
    vehicles: new Set(layout.vehicles.map((item) => item.assetId)),
    guns: new Set(layout.props.map((item) => item.assetId)),
    characters: new Set(["player", ...layout.characters.map((item) => item.assetId)]),
  };
  const groups = Object.entries(ASSET_MANIFEST);
  const total = Object.values(required).reduce((sum, ids) => sum + ids.size, 0);
  let loadedCount = 0;

  for (const [groupName, entries] of groups) {
    catalog[groupName] = {};
    for (const [assetId, asset] of Object.entries(entries)) {
      if (!required[groupName]?.has(assetId)) continue;
      onStatus(`Loading ${asset.label} (${loadedCount + 1}/${total})...`);
      try {
        catalog[groupName][assetId] = await loader.loadAsync(resolveAssetUrl(asset.path));
      } catch (error) {
        console.warn(`Failed to load asset ${assetId}`, error);
        catalog[groupName][assetId] = null;
      }
      loadedCount += 1;
    }
  }

  return catalog;
}

function resolveCircleVsRect(body, rect) {
  const halfWidth = rect.footprint.width * 0.5;
  const halfDepth = rect.footprint.depth * 0.5;
  const closestX = Math.max(rect.x - halfWidth, Math.min(rect.x + halfWidth, body.position.x));
  const closestZ = Math.max(rect.z - halfDepth, Math.min(rect.z + halfDepth, body.position.z));
  let dx = body.position.x - closestX;
  let dz = body.position.z - closestZ;
  let distance = Math.hypot(dx, dz);
  if (distance >= PLAYER_RADIUS) return;
  if (distance < 0.0001) {
    dx = body.position.x >= rect.x ? 1 : -1;
    dz = body.position.z >= rect.z ? 1 : -1;
    distance = 1;
  }
  const push = PLAYER_RADIUS - distance;
  body.position.x += (dx / distance) * push;
  body.position.z += (dz / distance) * push;
}

function addGunPedestal(scene, prop) {
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.8, 1.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x6f6557, roughness: 0.9 }),
  );
  pedestal.position.set(prop.position.x, 0.6, prop.position.z);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);
}

export async function createThreeDApp({ sceneRoot, canvas, hudMode, hudLocation, hudSpeed, hudScene, onStatus }) {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbad7ef, 120, 280);

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 1000);
  camera.position.set(-22, 18, 34);

  addSky(scene);
  addLights(scene);

  const layout = createPrototypeLayout();
  addGround(scene, layout.world);

  const catalog = await loadAssetCatalog(onStatus);

  for (const road of layout.roads) addRoad(scene, catalog.roads[road.assetId], road);
  for (const building of layout.buildings) createStaticPlacement(scene, catalog.buildings[building.assetId], building, 0x877d70);
  for (const vehicle of layout.vehicles) createStaticPlacement(scene, catalog.vehicles[vehicle.assetId], vehicle, 0x49596a);
  for (const prop of layout.props) {
    addGunPedestal(scene, prop);
    createStaticPlacement(scene, catalog.guns[prop.assetId], prop, 0x6f6458);
  }

  const player = createCharacter(scene, catalog.characters.player, { position: layout.spawnPoint, heading: 0 }, 0x51606d);
  const npcs = layout.characters.map((character) => createCharacter(scene, catalog.characters[character.assetId], character, 0x7c6e60));

  const buildingColliders = layout.buildings.map((building) => ({
    x: building.position.x,
    z: building.position.z,
    footprint: building.footprint || { width: building.width, depth: building.depth },
  }));

  const state = {
    mode: "free-roam",
    player: player.state,
    npcs,
    input: new Set(),
    running: false,
    externalTime: false,
    elapsed: 0,
    sceneCounts: {
      vehicles: layout.vehicles,
      characters: [layout.spawnPoint, ...layout.characters],
      props: layout.props,
    },
  };

  function syncCharacter(character, runHeld) {
    character.root.position.x = character.state.position.x;
    character.root.position.z = character.state.position.z;
    character.root.rotation.y = character.state.facing;
    const animationName = chooseAnimationName({
      speed: character.state.speed,
      isRunning: runHeld,
    });
    character.state.animationState = animationName;
    setCharacterAnimation(character, animationName);
    character.mixer?.update(FIXED_DT);
  }

  function updateNPCs(dt) {
    for (const npc of npcs) {
      let targetX = npc.state.originX + Math.cos(state.elapsed * 0.35 + npc.state.phase) * npc.state.patrolRadius;
      let targetZ = npc.state.originZ + Math.sin(state.elapsed * 0.35 + npc.state.phase) * npc.state.patrolRadius;
      if (npc.state.path?.length) {
        const waypoint = npc.state.path[npc.state.pathIndex];
        targetX = waypoint.x;
        targetZ = waypoint.z;
      }

      const dx = targetX - npc.state.position.x;
      const dz = targetZ - npc.state.position.z;
      const distance = Math.hypot(dx, dz);
      const step = Math.min(distance, dt * 3);

      if (distance > 0.001) {
        npc.state.position.x += (dx / distance) * step;
        npc.state.position.z += (dz / distance) * step;
        npc.state.facing = Math.atan2(dx, dz);
        npc.state.speed = step / dt;
        if (npc.state.path?.length && distance < 0.8) npc.state.pathIndex = (npc.state.pathIndex + 1) % npc.state.path.length;
      } else {
        npc.state.speed = 0;
      }

      syncCharacter(npc, false);
    }
  }

  function updatePlayer(dt) {
    const inputVector = {
      x: (state.input.has("right") ? 1 : 0) - (state.input.has("left") ? 1 : 0),
      z: (state.input.has("down") ? 1 : 0) - (state.input.has("up") ? 1 : 0),
    };
    updatePlayerState(state.player, inputVector, dt, state.running);
    const clamped = clampPlayerToWorld(state.player, layout.world, 7);
    state.player.position.x = clamped.position.x;
    state.player.position.z = clamped.position.z;

    for (const rect of buildingColliders) resolveCircleVsRect(state.player, rect);

    player.root.position.x = state.player.position.x;
    player.root.position.z = state.player.position.z;
    player.root.rotation.y = state.player.facing;
    syncCharacter(player, state.running);

    const desiredCamera = new THREE.Vector3(
      state.player.position.x - 22,
      18,
      state.player.position.z + 24,
    );
    camera.position.lerp(desiredCamera, 0.08);
    camera.lookAt(state.player.position.x, 4.8, state.player.position.z);
  }

  function step(dt) {
    state.elapsed += dt;
    updatePlayer(dt);
    updateNPCs(dt);

    hudMode.textContent = state.running ? "MODE FREE ROAM RUNNING" : "MODE FREE ROAM";
    hudLocation.textContent =
      state.player.position.z < -20 ? "SECTOR NORTH BLOCK" :
      state.player.position.z > 20 ? "SECTOR SOUTH BLOCK" :
      "SECTOR CENTRAL BLOCK";
    hudSpeed.textContent = `SPEED ${state.player.speed.toFixed(1)}`;
    hudScene.textContent = `SCENE ${layout.buildings.length} BUILDINGS ${layout.vehicles.length} CARS`;
  }

  function render() {
    renderer.render(scene, camera);
  }

  function handleKey(event, active) {
    const key = event.key.toLowerCase();
    if (["w", "arrowup"].includes(key)) state.input[active ? "add" : "delete"]("up");
    if (["s", "arrowdown"].includes(key)) state.input[active ? "add" : "delete"]("down");
    if (["a", "arrowleft"].includes(key)) state.input[active ? "add" : "delete"]("left");
    if (["d", "arrowright"].includes(key)) state.input[active ? "add" : "delete"]("right");
    if (key === "shift") state.running = active;
    if (active && key === "f") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    }
  }

  window.addEventListener("keydown", (event) => handleKey(event, true));
  window.addEventListener("keyup", (event) => handleKey(event, false));
  window.addEventListener("resize", () => resize(renderer, camera, sceneRoot));

  resize(renderer, camera, sceneRoot);
  onStatus("Scene loaded. The city block is ready.");

  window.render_game_to_text = () => createTextSnapshot({
    mode: state.mode,
    player: state.player,
    camera: camera.position,
    scene: state.sceneCounts,
  });

  window.advanceTime = (ms) => {
    state.externalTime = true;
    const steps = Math.max(1, Math.round(ms / (FIXED_DT * 1000)));
    for (let index = 0; index < steps; index += 1) step(FIXED_DT);
    render();
  };

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (!state.externalTime) step(dt);
    render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return { scene, state, layout };
}
