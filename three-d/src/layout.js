export function createPrototypeLayout() {
  const world = { width: 220, depth: 220, groundColor: "#6c8660" };
  const spawnPoint = { x: 0, y: 0, z: 8 };

  const roads = [
    { assetId: "boulevard", position: { x: 0, y: 0.02, z: 0 }, x: 0, z: 0, rotationY: 0, width: 34, depth: 220, size: 70 },
    { assetId: "boulevard", position: { x: 0, y: 0.02, z: 0 }, x: 0, z: 0, rotationY: Math.PI / 2, width: 34, depth: 220, size: 70 },
    { assetId: "blockStreet", position: { x: -88, y: 0.02, z: 0 }, x: -88, z: 0, rotationY: 0, width: 22, depth: 150, size: 44 },
    { assetId: "blockStreet", position: { x: 88, y: 0.02, z: 0 }, x: 88, z: 0, rotationY: 0, width: 22, depth: 150, size: 44 },
  ];

  const buildings = [
    { assetId: "apartment", position: { x: -74, y: 0, z: -74 }, x: -74, z: -74, rotationY: 0, width: 36, depth: 28, height: 44, footprint: { width: 30, depth: 26 } },
    { assetId: "apartment", position: { x: -30, y: 0, z: -86 }, x: -30, z: -86, rotationY: 0.12, width: 36, depth: 28, height: 44, footprint: { width: 30, depth: 26 } },
    { assetId: "apartment", position: { x: 68, y: 0, z: -82 }, x: 68, z: -82, rotationY: -0.08, width: 36, depth: 28, height: 44, footprint: { width: 30, depth: 26 } },
    { assetId: "factory", position: { x: 86, y: 0, z: -8 }, x: 86, z: -8, rotationY: 0.08, width: 40, depth: 30, height: 28, footprint: { width: 36, depth: 28 } },
    { assetId: "factory", position: { x: -82, y: 0, z: 74 }, x: -82, z: 74, rotationY: 0.04, width: 40, depth: 30, height: 28, footprint: { width: 36, depth: 28 } },
    { assetId: "factory", position: { x: 62, y: 0, z: 78 }, x: 62, z: 78, rotationY: 0.18, width: 40, depth: 30, height: 28, footprint: { width: 36, depth: 28 } },
    { assetId: "factory", position: { x: 18, y: 0, z: 94 }, x: 18, z: 94, rotationY: -0.18, width: 40, depth: 30, height: 28, footprint: { width: 36, depth: 28 } },
  ];

  const vehicles = [
    { assetId: "policeCar", position: { x: -12, y: 0, z: -26 }, x: -12, z: -26, rotationY: Math.PI / 2, width: 11, depth: 22, height: 6, size: 12 },
    { assetId: "van", position: { x: 16, y: 0, z: -30 }, x: 16, z: -30, rotationY: Math.PI / 2, width: 12, depth: 24, height: 10, size: 12 },
    { assetId: "van", position: { x: -48, y: 0, z: 22 }, x: -48, z: 22, rotationY: 0, width: 12, depth: 24, height: 10, size: 12 },
    { assetId: "policeCar", position: { x: 52, y: 0, z: 26 }, x: 52, z: 26, rotationY: Math.PI, width: 11, depth: 22, height: 6, size: 12 },
    { assetId: "van", position: { x: 12, y: 0, z: 54 }, x: 12, z: 54, rotationY: Math.PI / 2, width: 12, depth: 24, height: 10, size: 12 },
  ];

  const characters = [
    { assetId: "civilianA", position: { x: -8, y: 0, z: 10 }, x: -8, z: 10, heading: 0.5, rotationY: 0.5, patrolRadius: 10, behavior: "patrol", path: [{ x: -8, z: 10 }, { x: -8, z: -12 }] },
    { assetId: "civilianB", position: { x: 10, y: 0, z: 6 }, x: 10, z: 6, heading: -0.8, rotationY: -0.8, patrolRadius: 8, behavior: "patrol", path: [{ x: 10, z: 6 }, { x: 10, z: -12 }] },
    { assetId: "guard", position: { x: 22, y: 0, z: -10 }, x: 22, z: -10, heading: Math.PI, rotationY: Math.PI, patrolRadius: 4, behavior: "idle" },
    { assetId: "civilianA", position: { x: -20, y: 0, z: 18 }, x: -20, z: 18, heading: -Math.PI / 2, rotationY: -Math.PI / 2, patrolRadius: 5, behavior: "patrol", path: [{ x: -20, z: 18 }, { x: -4, z: 18 }] },
    { assetId: "civilianB", position: { x: 18, y: 0, z: 18 }, x: 18, z: 18, heading: Math.PI * 0.4, rotationY: Math.PI * 0.4, patrolRadius: 6, behavior: "idle" },
  ];

  const props = [
    { assetId: "pistol", position: { x: -10, y: 0.8, z: 20 }, x: -10, z: 20, rotationY: 0.3, width: 3, depth: 3, height: 2, size: 2.4 },
    { assetId: "rifle", position: { x: 12, y: 0.8, z: 18 }, x: 12, z: 18, rotationY: -0.5, width: 4, depth: 4, height: 3, size: 3.2 },
    { assetId: "pistol", position: { x: 0, y: 0.8, z: -12 }, x: 0, z: -12, rotationY: Math.PI * 0.5, width: 3, depth: 3, height: 2, size: 2.4 },
  ];

  return {
    world,
    spawn: spawnPoint,
    spawnPoint,
    playerSpawn: spawnPoint,
    roads,
    buildings,
    vehicles,
    characters,
    props,
  };
}
