const WALK_SPEED = 9;
const RUN_SPEED = 16;

export function normalizeInputVector(vector) {
  const length = Math.hypot(vector.x, vector.z);
  if (!length) return { x: 0, z: 0 };
  if (length <= 1) return { x: vector.x, z: vector.z };
  return { x: vector.x / length, z: vector.z / length };
}

export function computeIntentVector(input) {
  return normalizeInputVector({
    x: Number(input.right || 0) - Number(input.left || 0),
    z: Number(input.backward || 0) - Number(input.forward || 0),
  });
}

export function deriveMotionState({ speed, runHeld }) {
  if (speed < 0.05) return "idle";
  return runHeld ? "run" : "walk";
}

export function chooseAnimationName({ speed, isRunning }) {
  return deriveMotionState({ speed, runHeld: isRunning });
}

export function selectCharacterClip(clipNames, desiredState) {
  const candidates =
    desiredState === "run" ? ["run", "running"] :
    desiredState === "walk" ? ["walk", "walking"] :
    ["idle", "standing"];

  const normalized = clipNames.map((name) => ({ raw: name, lower: name.toLowerCase() }));
  for (const candidate of candidates) {
    const match = normalized.find((clip) => clip.lower.includes(candidate));
    if (match) return match.raw;
  }
  return clipNames[0] || null;
}

export function stepPlayerState(player, input, dt) {
  const move = computeIntentVector(input);
  const topSpeed = input.sprint ? RUN_SPEED : WALK_SPEED;
  const velocity = { x: move.x * topSpeed, z: move.z * topSpeed };
  const speed = Math.hypot(velocity.x, velocity.z);
  const next = {
    ...player,
    position: {
      x: player.position.x + velocity.x * dt,
      z: player.position.z + velocity.z * dt,
    },
    velocity,
    speed,
    animationState: deriveMotionState({ speed, runHeld: Boolean(input.sprint) }),
  };

  if (speed > 0.01) next.facing = Math.atan2(velocity.x, velocity.z);
  return next;
}

export function clampPlayerToWorld(player, world, padding = 5) {
  return {
    ...player,
    position: {
      x: Math.max(-world.width * 0.5 + padding, Math.min(world.width * 0.5 - padding, player.position.x)),
      z: Math.max(-world.depth * 0.5 + padding, Math.min(world.depth * 0.5 - padding, player.position.z)),
    },
  };
}

export function updatePlayerState(player, inputVector, dt, isRunning) {
  const next = stepPlayerState(player, {
    left: inputVector.x < 0 ? 1 : 0,
    right: inputVector.x > 0 ? 1 : 0,
    forward: inputVector.z < 0 ? 1 : 0,
    backward: inputVector.z > 0 ? 1 : 0,
    sprint: isRunning,
  }, dt);

  player.velocity.x = next.velocity.x;
  player.velocity.z = next.velocity.z;
  player.position.x = next.position.x;
  player.position.z = next.position.z;
  player.speed = next.speed;
  player.facing = next.facing;
  player.animationState = next.animationState;
  return player;
}
