import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

import { getAssetManifest } from "./asset-manifest.mjs";
import { createPrototypeLayout } from "./layout.mjs";
import { clampPlayerToWorld, selectCharacterClip, stepPlayerState } from "./player.mjs";
import { createTextSnapshot } from "./render-state.mjs";

const FIXED_DT = 1 / 60;

function promiseLoad(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function fitObjectToSize(root, targetSize) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest <= 0) return;
  const scale = targetSize / longest;
  root.scale.multiplyScalar(scale);
}

function placeOnGround(root) {
  const box = new THREE.Box3().setFromObject(root);
  root.position.y -= box.min.y;
}

function tintGround(scene, world) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(world.width, world.depth, 4, 4),
    new THREE.MeshStandardMaterial({ color: world.groundColor, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI * 0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const stripeMat = new THREE.MeshStandardMaterial({ color: "#68815f", roughness: 0.98 });
  for (const [x, z, w, h] of [
    [-72, -72, 38, 26],
    [72, -70, 34, 30],
    [-74, 74, 30, 24],
    [72, 72, 34, 28],
  ]) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, h), stripeMat);
    pad.rotation.x = -Math.PI * 0.5;
    pad.position.set(x, 0.01, z);
    scene.add(pad);
  }
}

function createPedestal(position) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.2, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: "#a78c60", roughness: 0.85 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(position.x, 0.25, position.z);
  return mesh;
}

function resolveBuildingCollision(player, layout) {
  const margin = 4.6;
  for (const building of layout.buildings) {
    const halfW = building.footprint.width * 0.5 + margin;
    const halfD = building.footprint.depth * 0.5 + margin;
    const dx = player.position.x - building.position.x;
    const dz = player.position.z - building.position.z;
    if (Math.abs(dx) <= halfW && Math.abs(dz) <= halfD) {
      const pushX = halfW - Math.abs(dx);
      const pushZ = halfD - Math.abs(dz);
      if (pushX < pushZ) {
        player.position.x += dx >= 0 ? pushX : -pushX;
      } else {
        player.position.z += dz >= 0 ? pushZ : -pushZ;
      }
    }
  }
  return player;
}

function setAction(entity, desiredState) {
  if (!entity.mixer || !entity.actions.size) return;
  const clipName = selectCharacterClip([...entity.actions.keys()], desiredState);
  if (!clipName || clipName === entity.activeClip) return;
  const action = entity.actions.get(clipName);
  if (!action) return;
  if (entity.activeAction) {
    entity.activeAction.fadeOut(0.2);
  }
  action.reset().fadeIn(0.2).play();
  entity.activeAction = action;
  entity.activeClip = clipName;
}

async function buildAssetLibrary() {
  const loader = new GLTFLoader();
  const manifest = getAssetManifest();
  const library = new Map();

  for (const category of Object.values(manifest)) {
    for (const [assetId, asset] of Object.entries(category)) {
      if (library.has(assetId)) continue;
      const gltf = await promiseLoad(loader, asset.path);
      library.set(assetId, gltf);
    }
  }

  return { manifest, library };
}

function cloneSceneRoot(gltf) {
  const hasSkin = gltf.scene.getObjectByProperty("isSkinnedMesh", true);
  return hasSkin ? cloneSkeleton(gltf.scene) : gltf.scene.clone(true);
}

function createPrototypeEntity(gltf, item, { isCharacter = false } = {}) {
  const root = cloneSceneRoot(gltf);
  fitObjectToSize(root, item.size);
  placeOnGround(root);
  root.position.set(item.position.x, item.position.y || 0, item.position.z);
  root.rotation.y = item.rotationY || 0;
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const entity = {
    root,
    mixer: null,
    actions: new Map(),
    activeAction: null,
    activeClip: null,
    animationState: item.behavior === "patrol" ? "walk" : "idle",
    assetId: item.assetId,
    path: item.path ? item.path.map((point) => ({ ...point })) : null,
    pathIndex: 0,
  };

  if (isCharacter && gltf.animations.length) {
    entity.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) {
      entity.actions.set(clip.name, entity.mixer.clipAction(clip));
    }
    setAction(entity, entity.animationState);
  }

  return entity;
}

function updateNpc(entity, dt) {
  if (!entity.path || entity.path.length < 2) {
    setAction(entity, "idle");
    entity.mixer?.update(dt);
    return;
  }

  const target = entity.path[entity.pathIndex];
  const dx = target.x - entity.root.position.x;
  const dz = target.z - entity.root.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.8) {
    entity.pathIndex = (entity.pathIndex + 1) % entity.path.length;
  } else {
    const speed = 2.1;
    entity.root.position.x += (dx / dist) * speed * dt;
    entity.root.position.z += (dz / dist) * speed * dt;
    entity.root.rotation.y = Math.atan2(dx, dz);
  }
  entity.animationState = dist < 0.5 ? "idle" : "walk";
  setAction(entity, entity.animationState);
  entity.mixer?.update(dt);
}

function resizeRenderer(app) {
  const width = app.canvas.clientWidth || app.canvas.parentElement.clientWidth || window.innerWidth;
  const height = app.canvas.clientHeight || app.canvas.parentElement.clientHeight || window.innerHeight;
  app.renderer.setSize(width, height, false);
  app.camera.aspect = width / height;
  app.camera.updateProjectionMatrix();
}

export function createPrototypeApp(options) {
  const layout = createPrototypeLayout();
  const app = {
    ...options,
    layout,
    mode: "menu",
    keys: new Set(),
    player: {
      position: { x: layout.spawn.x, y: 0, z: layout.spawn.z },
      velocity: { x: 0, z: 0 },
      facing: Math.PI,
      speed: 0,
      animationState: "idle",
    },
    sceneEntities: { vehicles: [], characters: [], props: [] },
    bootPromise: null,
    lastTime: null,
  };

  app.renderer = new THREE.WebGLRenderer({ canvas: app.canvas, antialias: true, alpha: false });
  app.renderer.shadowMap.enabled = true;
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  app.scene = new THREE.Scene();
  app.scene.background = new THREE.Color("#9bb39d");
  app.scene.fog = new THREE.Fog("#9bb39d", 72, 210);

  app.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
  app.camera.position.set(0, 18, 26);

  const hemi = new THREE.HemisphereLight("#e9f1d9", "#556152", 1.5);
  const dir = new THREE.DirectionalLight("#fff2d5", 2.2);
  dir.position.set(34, 48, 16);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  app.scene.add(hemi, dir);

  tintGround(app.scene, layout.world);

  app.playerAnchor = new THREE.Group();
  app.playerAnchor.position.set(layout.spawn.x, 0, layout.spawn.z);
  app.scene.add(app.playerAnchor);

  const updateHud = () => {
    app.hudMode.textContent = app.mode === "play" ? "3D FREE ROAM" : "READY";
    app.hudHint.textContent = app.mode === "play" ? `${app.player.animationState.toUpperCase()} | WASD MOVE | SHIFT RUN` : "PRESS START";
    app.hudCount.textContent = `${app.sceneEntities.characters.length} NPCs | ${app.sceneEntities.vehicles.length} VEHICLES`;
  };

  const syncCamera = () => {
    const facingX = Math.sin(app.player.facing);
    const facingZ = Math.cos(app.player.facing);
    const target = new THREE.Vector3(
      app.player.position.x + facingX * 8,
      4.4,
      app.player.position.z + facingZ * 8,
    );
    const offset = new THREE.Vector3(
      Math.sin(app.player.facing + Math.PI) * 14,
      12.5,
      Math.cos(app.player.facing + Math.PI) * 14,
    );
    const desired = target.clone().add(offset);
    app.camera.position.lerp(desired, 0.08);
    app.camera.lookAt(target);
  };

  const render = () => {
    syncCamera();
    if (app.playerEntity) {
      app.playerEntity.root.position.set(app.player.position.x, 0, app.player.position.z);
      app.playerEntity.root.rotation.y = app.player.facing;
      setAction(app.playerEntity, app.player.animationState);
    }
    updateHud();
    app.renderer.render(app.scene, app.camera);
  };

  const update = (dt) => {
    if (app.mode !== "play") return;

    const input = {
      forward: app.keys.has("KeyW") || app.keys.has("ArrowUp"),
      backward: app.keys.has("KeyS") || app.keys.has("ArrowDown"),
      left: app.keys.has("KeyA") || app.keys.has("ArrowLeft"),
      right: app.keys.has("KeyD") || app.keys.has("ArrowRight"),
      sprint: app.keys.has("ShiftLeft") || app.keys.has("ShiftRight"),
    };

    app.player = stepPlayerState(app.player, input, dt);
    app.player = clampPlayerToWorld(app.player, layout.world);
    app.player = resolveBuildingCollision(app.player, layout);
    app.playerEntity?.mixer?.update(dt);

    for (const entity of app.sceneEntities.characters) {
      if (entity === app.playerEntity) continue;
      updateNpc(entity, dt);
    }
  };

  const loop = (time) => {
    if (app.lastTime == null) app.lastTime = time;
    const delta = Math.min(0.05, (time - app.lastTime) / 1000);
    app.lastTime = time;
    update(delta || FIXED_DT);
    render();
    requestAnimationFrame(loop);
  };

  const bootScene = async () => {
    app.mode = "loading";
    app.statusLine.textContent = "Loading streets, rigs, and parked metal...";
    const { library } = await buildAssetLibrary();

    for (const road of layout.roads) {
      const entity = createPrototypeEntity(library.get(road.assetId), road);
      app.scene.add(entity.root);
    }

    for (const building of layout.buildings) {
      const entity = createPrototypeEntity(library.get(building.assetId), building);
      app.scene.add(entity.root);
    }

    for (const vehicle of layout.vehicles) {
      const entity = createPrototypeEntity(library.get(vehicle.assetId), vehicle);
      app.scene.add(entity.root);
      app.sceneEntities.vehicles.push(entity);
    }

    for (const prop of layout.props) {
      const pedestal = createPedestal(prop.position);
      app.scene.add(pedestal);
      const entity = createPrototypeEntity(library.get(prop.assetId), prop);
      entity.root.position.y += 0.48;
      app.scene.add(entity.root);
      app.sceneEntities.props.push(entity);
    }

    for (const character of layout.characters) {
      const entity = createPrototypeEntity(library.get(character.assetId), character, { isCharacter: true });
      app.scene.add(entity.root);
      app.sceneEntities.characters.push(entity);
    }

    const playerTemplate = createPrototypeEntity(
      library.get("cityMan") || library.get("businessRunner"),
      {
        assetId: "cityMan",
        size: 5.4,
        position: { x: layout.spawn.x, y: 0, z: layout.spawn.z },
        rotationY: Math.PI,
        behavior: "idle",
      },
      { isCharacter: true },
    );
    app.scene.add(playerTemplate.root);
    app.playerEntity = playerTemplate;
    app.sceneEntities.characters.push(playerTemplate);

    app.mode = "play";
    app.statusLine.textContent = "Prototype loaded. Walk the block and inspect the assets.";
    updateHud();
    render();
  };

  window.render_game_to_text = () =>
    createTextSnapshot({
      mode: app.mode,
      player: app.player,
      camera: app.camera.position,
      scene: app.sceneEntities,
    });

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (FIXED_DT * 1000)));
    for (let i = 0; i < steps; i += 1) update(FIXED_DT);
    render();
  };

  app.start = async () => {
    if (!app.bootPromise) {
      app.bootPromise = bootScene();
    }
    await app.bootPromise;
  };

  window.addEventListener("keydown", (event) => {
    app.keys.add(event.code);
    if (event.code === "KeyF") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
  });
  window.addEventListener("keyup", (event) => app.keys.delete(event.code));
  window.addEventListener("resize", () => {
    resizeRenderer(app);
    render();
  });

  resizeRenderer(app);
  updateHud();
  render();
  requestAnimationFrame(loop);
  return app;
}
