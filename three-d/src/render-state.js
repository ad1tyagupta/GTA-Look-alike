export function serializeGameState({ player, npcs = [], mode, camera = null, scene = null }) {
  const facing = typeof player.facing === "number" ? player.facing : 0;
  const sceneVehicles = Array.isArray(scene?.vehicles) ? scene.vehicles.length : scene?.vehicles ?? 0;
  const sceneCharacters = Array.isArray(scene?.characters) ? scene.characters.length : scene?.characters ?? 0;
  const sceneProps = Array.isArray(scene?.props) ? scene.props.length : scene?.props ?? 0;

  return JSON.stringify({
    mode,
    coordinateSystem: "x right, z forward/back on ground plane, y up",
    player: {
      x: Number(player.position.x.toFixed(2)),
      y: Number((player.position.y || 0).toFixed(2)),
      z: Number(player.position.z.toFixed(2)),
      facing: Number(facing.toFixed(2)),
      speed: Number(player.speed.toFixed(2)),
      animationState: player.animationState || null,
    },
    camera: camera ? {
      x: Number(camera.x.toFixed(2)),
      y: Number(camera.y.toFixed(2)),
      z: Number(camera.z.toFixed(2)),
    } : null,
    scene: scene ? {
      vehicles: sceneVehicles,
      characters: sceneCharacters,
      props: sceneProps,
    } : { npcCount: npcs.length },
  });
}

export function createTextSnapshot(payload) {
  return serializeGameState(payload);
}
