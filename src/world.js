import { BUILDING_STYLES, CONFIG, DISTRICTS } from "./config.js";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function choice(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function rand(rng, min, max) {
  return min + rng() * (max - min);
}

function addRoad(roads, x, y, w, h, orientation, districtId) {
  roads.push({ x, y, w, h, orientation, districtId });
}

function districtAt(x, y) {
  return DISTRICTS.find((district) => x >= district.x && x < district.x + district.w && y >= district.y && y < district.y + district.h) || DISTRICTS[0];
}

function addNode(nodes, x, y, kind = "intersection") {
  nodes.push({ x, y, kind });
}

function pointInRect(x, y, rect, padding = 0) {
  return x >= rect.x - padding && x <= rect.x + rect.w + padding && y >= rect.y - padding && y <= rect.y + rect.h + padding;
}

function pushCarLoops(paths, x1, y1, x2, y2, orientation, laneOffset) {
  if (orientation === "horizontal") {
    paths.push([
      { x: x1, y: y1 - laneOffset },
      { x: x2, y: y1 - laneOffset },
      { x: x2, y: y1 + laneOffset },
      { x: x1, y: y1 + laneOffset },
    ]);
    paths.push([
      { x: x2, y: y1 + laneOffset },
      { x: x1, y: y1 + laneOffset },
      { x: x1, y: y1 - laneOffset },
      { x: x2, y: y1 - laneOffset },
    ]);
  } else {
    paths.push([
      { x: x1 - laneOffset, y: y1 },
      { x: x1 - laneOffset, y: y2 },
      { x: x1 + laneOffset, y: y2 },
      { x: x1 + laneOffset, y: y1 },
    ]);
    paths.push([
      { x: x1 + laneOffset, y: y2 },
      { x: x1 + laneOffset, y: y1 },
      { x: x1 - laneOffset, y: y1 },
      { x: x1 - laneOffset, y: y2 },
    ]);
  }
}

function createLandmarks() {
  return {
    fixerCorner: { x: 1040, y: 860, districtId: "residential", label: "Fixer Corner" },
    safehouse: { x: 1760, y: 5240, districtId: "residential", label: "Safehouse Garage" },
    mallSquare: { x: 1240, y: 2330, districtId: "residential", label: "Weston Mall" },
    parkCircle: { x: 1560, y: 3520, districtId: "residential", label: "Park Circle" },
    mansionRow: { x: 2480, y: 980, districtId: "residential", label: "Mansion Row" },
    civicPlaza: { x: 3960, y: 1320, districtId: "downtown", label: "Civic Plaza" },
    downtownGarage: { x: 4700, y: 4180, districtId: "downtown", label: "Central Garage" },
    policeHQ: { x: 3620, y: 2840, districtId: "downtown", label: "Police HQ" },
    financeTower: { x: 5200, y: 1640, districtId: "downtown", label: "Finance Tower" },
    neonStrip: { x: 3440, y: 5200, districtId: "downtown", label: "Neon Strip" },
    railYard: { x: 6220, y: 1840, districtId: "industrial", label: "Rail Yard" },
    harbor: { x: 7440, y: 3820, districtId: "industrial", label: "Harbor Works" },
    refinery: { x: 6860, y: 1160, districtId: "industrial", label: "Refinery" },
    foundry: { x: 8220, y: 2480, districtId: "industrial", label: "Iron Foundry" },
    airstrip: { x: 8480, y: 5480, districtId: "industrial", label: "Airstrip" },
  };
}

function buildDistrictBlocks(rng, district, verticalRoads, horizontalRoads, buildings, props, landmarks) {
  const roadInset = CONFIG.roadWidth * 0.5 + CONFIG.sidewalkWidth + 12;
  const districtV = verticalRoads.filter((x) => x > district.x && x < district.x + district.w);
  const districtH = horizontalRoads.filter((y) => y > district.y && y < district.y + district.h);

  for (let ix = 0; ix < districtV.length - 1; ix += 1) {
    for (let iy = 0; iy < districtH.length - 1; iy += 1) {
      const left = districtV[ix] + roadInset;
      const right = districtV[ix + 1] - roadInset;
      const top = districtH[iy] + roadInset;
      const bottom = districtH[iy + 1] - roadInset;
      const blockW = right - left;
      const blockH = bottom - top;
      if (blockW < 180 || blockH < 180) continue;

      const density = district.id === "downtown" ? 4 : district.id === "industrial" ? 2 : 3;
      const splitX = density > 2 ? Math.floor(rand(rng, 1, density + 1)) : 1;
      const splitY = density > 2 ? Math.floor(rand(rng, 1, density)) : 1;
      const cellW = blockW / splitX;
      const cellH = blockH / splitY;

      for (let cx = 0; cx < splitX; cx += 1) {
        for (let cy = 0; cy < splitY; cy += 1) {
          const x = left + cx * cellW + rand(rng, 6, 18);
          const y = top + cy * cellH + rand(rng, 6, 18);
          const w = cellW - rand(rng, 18, 40);
          const h = cellH - rand(rng, 18, 40);
          if (w < 120 || h < 120) continue;
          const type = choice(rng, district.buildingTypes);
          const styleKey =
            type === "park" ? "apartment" :
            type === "plaza" ? "office" :
            type === "yard" ? "warehouse" :
            type === "dock" ? "dock" :
            type === "factory" ? "factory" :
            type === "garage" ? "garage" :
            type === "mall" ? "mall" :
            type;
          buildings.push({
            x,
            y,
            w,
            h,
            type,
            style: BUILDING_STYLES[styleKey],
            districtId: district.id,
            floors:
              district.id === "downtown" ? Math.floor(rand(rng, 10, 22)) :
              district.id === "industrial" ? Math.floor(rand(rng, 3, 9)) :
              Math.floor(rand(rng, 4, 12)),
            roofInset: rand(rng, 6, 14),
            windowStepX: rand(rng, 14, 24),
            windowStepY: rand(rng, 14, 22),
            sign: rng() < 0.2 ? choice(rng, ["DINER", "MOTEL", "MARKET", "AUTO", "BANK", "DEPOT"]) : null,
          });

          if (type === "park") {
            props.push({ type: "parkPatch", x, y, w, h, districtId: district.id });
          }
          if (rng() < 0.55) props.push({ type: "tree", x: x - 8, y: y + rand(rng, 10, h - 10), r: rand(rng, 10, 18), districtId: district.id });
          if (rng() < 0.45) props.push({ type: "lamp", x: x + w + 8, y: y + rand(rng, 8, h - 8), h: rand(rng, 18, 26), districtId: district.id });
          if (district.id === "industrial" && rng() < 0.4) props.push({ type: "container", x: x + w * 0.1, y: y + h + 10, w: 46, h: 24, districtId: district.id });
          if (district.id === "downtown" && rng() < 0.35) props.push({ type: "sign", x: x + w * 0.5, y: y - 16, text: choice(rng, ["HOTEL", "PLAZA", "TOWER", "BANK"]), districtId: district.id });
        }
      }
    }
  }

  const residentialLandmark = landmarks.mallSquare;
  buildings.push({
    x: 1260,
    y: 1940,
    w: 300,
    h: 220,
    type: "mall",
    style: BUILDING_STYLES.mall,
    districtId: "residential",
    floors: 3,
    roofInset: 10,
    windowStepX: 18,
    windowStepY: 20,
    sign: "WESTON MALL",
    landmark: true,
  });

  const downtownLandmark = landmarks.civicPlaza;
  buildings.push({
    x: 3810,
    y: 1280,
    w: 250,
    h: 230,
    type: "plaza",
    style: BUILDING_STYLES.office,
    districtId: "downtown",
    floors: 14,
    roofInset: 12,
    windowStepX: 18,
    windowStepY: 16,
    sign: "CIVIC PLAZA",
    landmark: true,
  });

  const industrialLandmark = landmarks.harbor;
  buildings.push({
    x: 7060,
    y: 3330,
    w: 430,
    h: 240,
    type: "dock",
    style: BUILDING_STYLES.dock,
    districtId: "industrial",
    floors: 4,
    roofInset: 12,
    windowStepX: 20,
    windowStepY: 22,
    sign: "HARBOR WORKS",
    landmark: true,
  });
}

export function createWorld(rng) {
  const roads = [];
  const buildings = [];
  const props = [];
  const crosswalks = [];
  const carPaths = [];
  const navNodes = [];
  const roadblockSpots = [];
  const alleyConnectors = [];
  const missionAnchors = createLandmarks();

  const verticalRoads = [520, 1100, 1780, 2480, 3160, 3660, 4200, 4780, 5400, 6120, 6900, 7700, 8480, 9200];
  const horizontalRoads = [420, 1120, 1760, 2440, 3140, 3880, 4580, 5320, 5980];

  for (const x of verticalRoads) addRoad(roads, x - CONFIG.roadWidth * 0.5, 0, CONFIG.roadWidth, CONFIG.worldHeight, "vertical", districtAt(x, 100).id);
  for (const y of horizontalRoads) addRoad(roads, 0, y - CONFIG.roadWidth * 0.5, CONFIG.worldWidth, CONFIG.roadWidth, "horizontal", districtAt(100, y).id);

  for (const x of [1400, 2060, 5820, 7300, 8740]) {
    alleyConnectors.push({ x, y: 1760, w: 26, h: 1380, orientation: "vertical" });
  }
  for (const y of [1420, 3480, 4880]) {
    alleyConnectors.push({ x: 2480, y, w: 1180, h: 24, orientation: "horizontal" });
    alleyConnectors.push({ x: 6200, y: y + 160, w: 1400, h: 24, orientation: "horizontal" });
  }

  for (const alley of alleyConnectors) {
    roads.push({ ...alley, type: "alley", districtId: districtAt(alley.x, alley.y).id });
  }

  for (const district of DISTRICTS) buildDistrictBlocks(rng, district, verticalRoads, horizontalRoads, buildings, props, missionAnchors);

  for (const vx of verticalRoads) {
    for (const hy of horizontalRoads) {
      addNode(navNodes, vx, hy, "intersection");
      roadblockSpots.push({ x: vx, y: hy - 120, orientation: "horizontal" });
      roadblockSpots.push({ x: vx - 120, y: hy, orientation: "vertical" });
      crosswalks.push({ x: vx - CONFIG.roadWidth * 0.62, y: hy - CONFIG.roadWidth * 0.5 - 10, w: CONFIG.roadWidth * 1.24, h: 22, orientation: "horizontal" });
      crosswalks.push({ x: vx - 10, y: hy - CONFIG.roadWidth * 0.62, w: 22, h: CONFIG.roadWidth * 1.24, orientation: "vertical" });
    }
  }

  for (const alley of alleyConnectors) {
    addNode(navNodes, alley.x + alley.w * 0.5, alley.y + alley.h * 0.5, "connector");
  }

  const laneOffset = CONFIG.roadWidth * 0.28;
  for (const y of horizontalRoads) pushCarLoops(carPaths, 140, y, CONFIG.worldWidth - 140, null, "horizontal", laneOffset);
  for (const x of verticalRoads) pushCarLoops(carPaths, x, 140, null, CONFIG.worldHeight - 140, "vertical", laneOffset);

  props.push({ type: "fenceLot", x: 5980, y: 900, w: 620, h: 460, districtId: "industrial" });
  props.push({ type: "parkPatch", x: 660, y: 1800, w: 500, h: 320, districtId: "residential" });
  props.push({ type: "plazaPatch", x: 3360, y: 980, w: 720, h: 420, districtId: "downtown" });
  props.push({ type: "parkPatch", x: 1220, y: 3220, w: 680, h: 520, districtId: "residential" });
  props.push({ type: "median", x: 3000, y: 5178, w: 3200, h: 26, districtId: "downtown" });
  props.push({ type: "plazaPatch", x: 4700, y: 1450, w: 540, h: 420, districtId: "downtown" });
  props.push({ type: "dockWater", x: 7440, y: 4040, w: 2160, h: 2360, districtId: "industrial" });
  props.push({ type: "runway", x: 7480, y: 5300, w: 1920, h: 340, districtId: "industrial" });
  props.push({ type: "fenceLot", x: 8040, y: 2180, w: 880, h: 540, districtId: "industrial" });
  props.push({ type: "billboard", x: 2970, y: 750, w: 140, h: 90, districtId: "downtown", text: "VEXEL BANK" });
  props.push({ type: "billboard", x: 6580, y: 820, w: 140, h: 90, districtId: "industrial", text: "PORT 9" });
  props.push({ type: "billboard", x: 1850, y: 720, w: 140, h: 90, districtId: "residential", text: "WESTON" });
  props.push({ type: "parkingLot", x: 2060, y: 5440, w: 420, h: 280, districtId: "residential" });
  props.push({ type: "parkingLot", x: 5140, y: 4140, w: 380, h: 260, districtId: "downtown" });
  props.push({ type: "parkingLot", x: 7200, y: 1960, w: 460, h: 320, districtId: "industrial" });

  const cleanedBuildings = buildings.filter((building) => {
    for (const road of roads) {
      const overlap = building.x < road.x + road.w && building.x + building.w > road.x && building.y < road.y + road.h && building.y + building.h > road.y;
      if (overlap) return false;
    }
    return true;
  });

  const accessibilityWorld = { width: CONFIG.worldWidth, height: CONFIG.worldHeight, buildings: cleanedBuildings, props, roads };
  for (const [key, anchor] of Object.entries(missionAnchors)) {
    const accessible = findAccessiblePoint(accessibilityWorld, anchor.x, anchor.y, 480, 30, 24);
    missionAnchors[key] = { ...anchor, x: Math.round(accessible.x), y: Math.round(accessible.y) };
  }

  return {
    width: CONFIG.worldWidth,
    height: CONFIG.worldHeight,
    roads,
    buildings: cleanedBuildings,
    props,
    crosswalks,
    carPaths,
    navNodes,
    roadblockSpots,
    alleyConnectors,
    missionAnchors,
    districts: DISTRICTS,
  };
}

export function findDistrict(world, x, y) {
  return world.districts.find((district) => x >= district.x && x < district.x + district.w && y >= district.y && y < district.y + district.h) || world.districts[0];
}

export function nearestNavNode(world, x, y, filterKind = null) {
  let best = null;
  let bestDist = Infinity;
  for (const node of world.navNodes) {
    if (filterKind && node.kind !== filterKind) continue;
    const dx = node.x - x;
    const dy = node.y - y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  }
  return best;
}

export function isPointBlocked(world, x, y, padding = 20) {
  if (x < padding || y < padding || x > world.width - padding || y > world.height - padding) return true;
  const insideRunway = world.props.some((prop) => prop.type === "runway" && pointInRect(x, y, prop, 0));
  if (insideRunway) return false;
  for (const building of world.buildings) {
    if (pointInRect(x, y, building, padding)) return true;
  }
  for (const prop of world.props) {
    if ((prop.type === "dockWater" || prop.type === "fenceLot" || prop.type === "container" || prop.type === "billboard") && pointInRect(x, y, prop, padding)) return true;
    if (prop.type === "tree" && Math.hypot(x - prop.x, y - prop.y) < prop.r + padding) return true;
  }
  return false;
}

function accessibilityScore(world, x, y, originX, originY) {
  let score = -Math.hypot(x - originX, y - originY) * 0.02;
  for (const road of world.roads) {
    if (pointInRect(x, y, road, 12)) score += road.type === "alley" ? 4 : 7;
  }
  for (const prop of world.props) {
    if ((prop.type === "parkingLot" || prop.type === "plazaPatch" || prop.type === "parkPatch") && pointInRect(x, y, prop, 8)) score += 6;
  }
  return score;
}

export function findAccessiblePoint(world, originX, originY, searchRadius = 420, step = 34, padding = 20) {
  if (!isPointBlocked(world, originX, originY, padding)) return { x: originX, y: originY };
  let best = null;
  let bestScore = -Infinity;
  for (let radius = step; radius <= searchRadius; radius += step) {
    const samples = Math.max(12, Math.floor((Math.PI * 2 * radius) / step));
    for (let i = 0; i < samples; i += 1) {
      const angle = (Math.PI * 2 * i) / samples;
      const x = originX + Math.cos(angle) * radius;
      const y = originY + Math.sin(angle) * radius;
      if (isPointBlocked(world, x, y, padding)) continue;
      const score = accessibilityScore(world, x, y, originX, originY);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    if (best) return best;
  }
  return { x: originX, y: originY };
}

function matchingIntersection(world, x, y) {
  return world.navNodes.find((node) => node.kind === "intersection" && Math.abs(node.x - x) < 1 && Math.abs(node.y - y) < 1) || null;
}

export function planNavRoute(world, fromX, fromY, toX, toY) {
  const start = nearestNavNode(world, fromX, fromY, "intersection") || nearestNavNode(world, fromX, fromY);
  const end = nearestNavNode(world, toX, toY, "intersection") || nearestNavNode(world, toX, toY);
  if (!start || !end) return [];
  const route = [];
  const turnA = matchingIntersection(world, end.x, start.y);
  const turnB = matchingIntersection(world, start.x, end.y);
  const mid =
    turnA && turnB
      ? (Math.abs(fromX - turnA.x) + Math.abs(toY - turnA.y) < Math.abs(fromY - turnB.y) + Math.abs(toX - turnB.x) ? turnA : turnB)
      : turnA || turnB;
  if (Math.hypot(start.x - fromX, start.y - fromY) > 46) route.push({ x: start.x, y: start.y });
  if (mid && (mid.x !== start.x || mid.y !== start.y) && (mid.x !== end.x || mid.y !== end.y)) route.push({ x: mid.x, y: mid.y });
  if (Math.hypot(end.x - toX, end.y - toY) > 46) route.push({ x: end.x, y: end.y });
  route.push({ x: toX, y: toY });
  return route;
}

export function pickRoadblockSpot(world, x, y, dirX, dirY) {
  let best = null;
  let bestScore = -Infinity;
  for (const spot of world.roadblockSpots) {
    const dx = spot.x - x;
    const dy = spot.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 260 || dist > 1200) continue;
    const dot = dirX * (dx / dist) + dirY * (dy / dist);
    const score = dot * 2 - dist * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = spot;
    }
  }
  return best;
}

export function makeSeededRng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
