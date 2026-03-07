import { CONFIG } from "./config.js";
import { findDistrict } from "./world.js";

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

export function createRenderAssets() {
  return {
    asphalt: loadImage("./assets/asphalt.svg"),
    sidewalk: loadImage("./assets/sidewalk.svg"),
    facade: loadImage("./assets/facade-grid.svg"),
    minimapFrame: loadImage("./assets/minimap-frame.svg"),
  };
}

function patternOr(ctx, img, fallback) {
  try {
    if (img.complete && img.naturalWidth > 0) {
      return ctx.createPattern(img, "repeat") || fallback;
    }
  } catch {}
  return fallback;
}

function worldToScreen(state, x, y) {
  return { x: x - state.camera.x, y: y - state.camera.y };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawGround(ctx, canvas, state) {
  for (const district of state.world.districts) {
    const sx = district.x - state.camera.x;
    const sy = district.y - state.camera.y;
    const bg = ctx.createLinearGradient(sx, sy, sx + district.w * 0.7, sy + district.h);
    bg.addColorStop(0, district.groundA);
    bg.addColorStop(1, district.groundB);
    ctx.fillStyle = bg;
    ctx.fillRect(sx, sy, district.w, district.h);
  }

  const tile = 46;
  for (let y = -((state.camera.y % tile) + tile); y < canvas.height + tile; y += tile) {
    for (let x = -((state.camera.x % tile) + tile); x < canvas.width + tile; x += tile) {
      const worldX = x + state.camera.x;
      const worldY = y + state.camera.y;
      const district = findDistrict(state.world, worldX, worldY);
      const noise = Math.sin(worldX * 0.011 + worldY * 0.018);
      ctx.fillStyle =
        district.id === "downtown" ? `rgba(40, 72, 44, ${(0.018 + (noise + 1) * 0.009).toFixed(3)})` :
        district.id === "industrial" ? `rgba(76, 72, 44, ${(0.022 + (noise + 1) * 0.011).toFixed(3)})` :
        `rgba(58, 96, 40, ${(0.028 + (noise + 1) * 0.012).toFixed(3)})`;
      ctx.fillRect(x + 2, y + 2, district.id === "downtown" ? 3 : 2, district.id === "industrial" ? 3 : 2);
    }
  }

  const vignette = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.5, canvas.height * 0.15, canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.65);
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(1, "rgba(9,13,19,0.16)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawRoads(ctx, canvas, state, assets) {
  const asphalt = patternOr(ctx, assets.asphalt, "#5d636c");
  const sidewalk = patternOr(ctx, assets.sidewalk, "#a09c94");

  for (const road of state.world.roads) {
    const sx = road.x - state.camera.x;
    const sy = road.y - state.camera.y;
    ctx.fillStyle = road.type === "alley" ? "#50555e" : asphalt;
    ctx.fillRect(sx, sy, road.w, road.h);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(sx, sy, road.w, 4);
    ctx.fillRect(sx, sy + road.h - 4, road.w, 4);
  }

  const laneOffset = CONFIG.roadWidth * 0.28;
  ctx.strokeStyle = "rgba(240, 243, 247, 0.92)";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 15]);
  ctx.beginPath();
  for (const road of state.world.roads) {
    if (road.orientation === "horizontal" && road.type !== "alley") {
      const center = road.y + road.h * 0.5;
      ctx.moveTo(-state.camera.x, center - laneOffset - state.camera.y);
      ctx.lineTo(CONFIG.worldWidth - state.camera.x, center - laneOffset - state.camera.y);
      ctx.moveTo(-state.camera.x, center + laneOffset - state.camera.y);
      ctx.lineTo(CONFIG.worldWidth - state.camera.x, center + laneOffset - state.camera.y);
    }
    if (road.orientation === "vertical" && road.type !== "alley") {
      const center = road.x + road.w * 0.5;
      ctx.moveTo(center - laneOffset - state.camera.x, -state.camera.y);
      ctx.lineTo(center - laneOffset - state.camera.x, CONFIG.worldHeight - state.camera.y);
      ctx.moveTo(center + laneOffset - state.camera.x, -state.camera.y);
      ctx.lineTo(center + laneOffset - state.camera.x, CONFIG.worldHeight - state.camera.y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const road of state.world.roads) {
    if (road.type === "alley") {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      if (road.orientation === "vertical") {
        for (let y = road.y - state.camera.y; y < road.y + road.h - state.camera.y; y += 18) ctx.fillRect(road.x - state.camera.x + 6, y, road.w - 12, 6);
      } else {
        for (let x = road.x - state.camera.x; x < road.x + road.w - state.camera.x; x += 18) ctx.fillRect(x, road.y - state.camera.y + 6, 6, road.h - 12);
      }
    }
  }

  ctx.fillStyle = sidewalk;
  for (const road of state.world.roads) {
    if (road.type === "alley") continue;
    if (road.orientation === "horizontal") {
      ctx.fillRect(road.x - state.camera.x, road.y - state.camera.y - CONFIG.sidewalkWidth, road.w, CONFIG.sidewalkWidth);
      ctx.fillRect(road.x - state.camera.x, road.y + road.h - state.camera.y, road.w, CONFIG.sidewalkWidth);
    } else {
      ctx.fillRect(road.x - state.camera.x - CONFIG.sidewalkWidth, road.y - state.camera.y, CONFIG.sidewalkWidth, road.h);
      ctx.fillRect(road.x + road.w - state.camera.x, road.y - state.camera.y, CONFIG.sidewalkWidth, road.h);
    }
  }

  for (const road of state.world.roads) {
    if (road.orientation === "horizontal" && road.w > 2000 && road.type !== "alley") {
      ctx.fillStyle = "rgba(234, 198, 99, 0.14)";
      ctx.fillRect(road.x - state.camera.x, road.y + road.h * 0.5 - 5 - state.camera.y, road.w, 10);
    }
  }

  for (const cross of state.world.crosswalks) {
    const sx = cross.x - state.camera.x;
    const sy = cross.y - state.camera.y;
    ctx.fillStyle = "rgba(252, 253, 255, 0.74)";
    if (cross.orientation === "horizontal") {
      for (let x = sx; x < sx + cross.w; x += 18) ctx.fillRect(x, sy, 9, cross.h);
    } else {
      for (let y = sy; y < sy + cross.h; y += 18) ctx.fillRect(sx, y, cross.w, 9);
    }
  }
}

function drawProps(ctx, state) {
  for (const prop of state.world.props) {
    const sx = prop.x - state.camera.x;
    const sy = prop.y - state.camera.y;
    if (sx > state.camera.width + 120 || sy > state.camera.height + 120 || sx + (prop.w || 40) < -120 || sy + (prop.h || 40) < -120) continue;

    if (prop.type === "parkPatch") {
      ctx.fillStyle = "rgba(74, 127, 56, 0.36)";
      ctx.fillRect(sx, sy, prop.w, prop.h);
      ctx.strokeStyle = "rgba(206, 214, 189, 0.26)";
      ctx.strokeRect(sx + 6, sy + 6, prop.w - 12, prop.h - 12);
    } else if (prop.type === "plazaPatch") {
      ctx.fillStyle = "rgba(187, 186, 177, 0.55)";
      ctx.fillRect(sx, sy, prop.w, prop.h);
      ctx.strokeStyle = "rgba(114, 114, 108, 0.35)";
      for (let x = sx + 16; x < sx + prop.w; x += 28) ctx.beginPath(), ctx.moveTo(x, sy), ctx.lineTo(x, sy + prop.h), ctx.stroke();
    } else if (prop.type === "dockWater") {
      const grad = ctx.createLinearGradient(sx, sy, sx + prop.w, sy + prop.h);
      grad.addColorStop(0, "#45739a");
      grad.addColorStop(1, "#24435f");
      ctx.fillStyle = grad;
      ctx.fillRect(sx, sy, prop.w, prop.h);
    } else if (prop.type === "runway") {
      ctx.fillStyle = "#5f6467";
      ctx.fillRect(sx, sy, prop.w, prop.h);
      ctx.strokeStyle = "rgba(250,250,250,0.72)";
      ctx.setLineDash([20, 20]);
      ctx.beginPath();
      ctx.moveTo(sx + prop.w * 0.5, sy + 20);
      ctx.lineTo(sx + prop.w * 0.5, sy + prop.h - 20);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (prop.type === "fenceLot") {
      ctx.strokeStyle = "#9e9e93";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, prop.w, prop.h);
      for (let x = sx + 6; x < sx + prop.w; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, sy);
        ctx.lineTo(x + 10, sy + 10);
        ctx.stroke();
      }
    } else if (prop.type === "median") {
      ctx.fillStyle = "rgba(104, 128, 76, 0.92)";
      drawRoundedRect(ctx, sx, sy, prop.w, prop.h, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(224, 209, 152, 0.22)";
      for (let x = sx + 12; x < sx + prop.w; x += 48) ctx.fillRect(x, sy + 8, 22, prop.h - 16);
    } else if (prop.type === "parkingLot") {
      ctx.fillStyle = "#62686c";
      ctx.fillRect(sx, sy, prop.w, prop.h);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      for (let y = sy + 18; y < sy + prop.h - 18; y += 32) {
        for (let x = sx + 12; x < sx + prop.w - 20; x += 42) ctx.fillRect(x, y, 20, 2);
      }
    } else if (prop.type === "billboard") {
      ctx.fillStyle = "#434850";
      ctx.fillRect(sx + prop.w * 0.42, sy + prop.h, 12, 40);
      ctx.fillRect(sx + prop.w * 0.58, sy + prop.h, 12, 40);
      const face = ctx.createLinearGradient(sx, sy, sx, sy + prop.h);
      face.addColorStop(0, "#f0ddab");
      face.addColorStop(1, "#b98c53");
      ctx.fillStyle = face;
      drawRoundedRect(ctx, sx, sy, prop.w, prop.h, 8);
      ctx.fill();
      ctx.fillStyle = "#21252d";
      ctx.font = "700 18px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(prop.text, sx + prop.w * 0.5, sy + prop.h * 0.55);
    } else if (prop.type === "tree") {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(sx + 2, sy + prop.r * 0.58, prop.r * 1.05, prop.r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6f4d32";
      ctx.fillRect(sx - 2, sy + prop.r * 0.3, 4, prop.r * 0.92);
      const crown = ctx.createRadialGradient(sx, sy, 4, sx, sy, prop.r);
      crown.addColorStop(0, "#7eb866");
      crown.addColorStop(1, "#466d35");
      ctx.fillStyle = crown;
      ctx.beginPath();
      ctx.arc(sx, sy, prop.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.type === "lamp") {
      ctx.strokeStyle = "#434750";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - prop.h);
      ctx.stroke();
      ctx.fillStyle = "#d9d3b3";
      ctx.beginPath();
      ctx.arc(sx, sy - prop.h - 2, 4.2, 0, Math.PI * 2);
      ctx.fill();
      if (state.time > 0) {
        const glow = ctx.createRadialGradient(sx, sy - prop.h, 2, sx, sy - prop.h, 46);
        glow.addColorStop(0, "rgba(255,235,182,0.18)");
        glow.addColorStop(1, "rgba(255,235,182,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy - prop.h, 46, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (prop.type === "container") {
      ctx.fillStyle = "#9d5d37";
      drawRoundedRect(ctx, sx, sy, prop.w, prop.h, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.strokeRect(sx + 4, sy + 4, prop.w - 8, prop.h - 8);
    } else if (prop.type === "sign") {
      ctx.fillStyle = "rgba(24,27,35,0.84)";
      drawRoundedRect(ctx, sx - 38, sy - 12, 76, 18, 6);
      ctx.fill();
      ctx.fillStyle = "#f8dc8f";
      ctx.font = "700 10px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(prop.text, sx, sy + 1);
    }
  }
}

function drawBuildings(ctx, state, assets) {
  const facadePattern = patternOr(ctx, assets.facade, null);
  for (const building of state.world.buildings) {
    const sx = building.x - state.camera.x;
    const sy = building.y - state.camera.y;
    if (sx > state.camera.width + 120 || sy > state.camera.height + 120 || sx + building.w < -120 || sy + building.h < -120) continue;

    const shadowOffset = Math.max(5, Math.min(18, building.floors * 0.55));
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(sx + shadowOffset, sy + shadowOffset, building.w, building.h);

    const bodyGradient = ctx.createLinearGradient(sx, sy, sx + building.w, sy + building.h);
    bodyGradient.addColorStop(0, building.style.wall);
    bodyGradient.addColorStop(1, building.style.trim);
    ctx.fillStyle = bodyGradient;
    ctx.fillRect(sx, sy, building.w, building.h);

    if (facadePattern) {
      ctx.save();
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = facadePattern;
      ctx.fillRect(sx, sy, building.w, building.h);
      ctx.restore();
    }

    ctx.fillStyle = building.style.roof;
    ctx.fillRect(sx + building.roofInset, sy + building.roofInset, building.w - building.roofInset * 2, building.h - building.roofInset * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, building.w, building.h);

    ctx.fillStyle = building.style.window;
    for (let y = sy + 16; y < sy + building.h - 14; y += building.windowStepY) {
      for (let x = sx + 16; x < sx + building.w - 14; x += building.windowStepX) {
        ctx.fillRect(x, y, 8, 5);
      }
    }

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(sx + building.w * 0.08, sy + building.h * 0.08, building.w * 0.84, 5);
    if (building.type === "tower" || building.type === "office") {
      ctx.fillStyle = "rgba(125, 210, 255, 0.08)";
      for (let y = sy + 26; y < sy + building.h - 16; y += 36) {
        ctx.fillRect(sx + 10, y, building.w - 20, 3);
      }
    }

    if (building.sign) {
      ctx.fillStyle = "rgba(18,20,27,0.76)";
      drawRoundedRect(ctx, sx + building.w * 0.18, sy + building.h - 22, building.w * 0.64, 16, 6);
      ctx.fill();
      ctx.fillStyle = findDistrict(state.world, building.x, building.y).accent;
      ctx.font = "700 11px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(building.sign, sx + building.w * 0.5, sy + building.h - 10);
    }
  }
}

function drawMissionEntities(ctx, state) {
  for (const target of state.mission.targets) {
    const p = worldToScreen(state, target.x, target.y);
    if (p.x < -60 || p.y < -60 || p.x > state.camera.width + 60 || p.y > state.camera.height + 60) continue;
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + target.r * 0.64, target.r * 1.1, target.r * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = target.kind === "crate" ? "#9d6a3e" : "#74442f";
    drawRoundedRect(ctx, p.x - target.r, p.y - target.r, target.r * 2, target.r * 2, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,221,168,0.82)";
    ctx.strokeRect(p.x - target.r + 3, p.y - target.r + 3, target.r * 2 - 6, target.r * 2 - 6);
  }
}

function drawVehicle(ctx, car, state) {
  const p = worldToScreen(state, car.x, car.y);
  if (p.x < -120 || p.y < -120 || p.x > state.camera.width + 120 || p.y > state.camera.height + 120) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, car.width * 0.62, car.length * 0.44, car.width * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createLinearGradient(-car.length * 0.5, 0, car.length * 0.5, 0);
  body.addColorStop(0, car.paint.primary);
  body.addColorStop(1, car.paint.secondary);
  ctx.fillStyle = body;
  drawRoundedRect(ctx, -car.length * 0.5, -car.width * 0.5, car.length, car.width, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  drawRoundedRect(ctx, -car.length * 0.28, -car.width * 0.4, car.length * 0.4, car.width * 0.26, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(20,24,31,0.52)";
  drawRoundedRect(ctx, -car.length * 0.08, -car.width * 0.33, car.length * 0.4, car.width * 0.66, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(-car.length * 0.22, -car.width * 0.12, car.length * 0.46, 4);

  ctx.fillStyle = "#171717";
  ctx.fillRect(-car.length * 0.42, -car.width * 0.55, 12, 4);
  ctx.fillRect(car.length * 0.3, -car.width * 0.55, 12, 4);
  ctx.fillRect(-car.length * 0.42, car.width * 0.55 - 4, 12, 4);
  ctx.fillRect(car.length * 0.3, car.width * 0.55 - 4, 12, 4);

  if (car.kind === "police") {
    const blink = Math.sin(state.time * 11 + car.flashPhase) > 0;
    ctx.fillStyle = blink ? "#4b84ff" : "#f45050";
    ctx.fillRect(-5, -car.width * 0.5 - 5, 9, 7);
    ctx.fillStyle = blink ? "#f45050" : "#4b84ff";
    ctx.fillRect(5, -car.width * 0.5 - 5, 9, 7);
  }

  ctx.fillStyle = "rgba(255, 184, 88, 0.35)";
  ctx.fillRect(car.length * 0.43, -car.width * 0.22, 4, car.width * 0.18);
  ctx.fillRect(car.length * 0.43, car.width * 0.04, 4, car.width * 0.18);
  ctx.fillStyle = "rgba(255, 67, 67, 0.26)";
  ctx.fillRect(-car.length * 0.47, -car.width * 0.22, 4, car.width * 0.18);
  ctx.fillRect(-car.length * 0.47, car.width * 0.04, 4, car.width * 0.18);

  if (state.player.inCarId === car.id) {
    ctx.strokeStyle = "#eef2a7";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, -car.length * 0.5 - 2, -car.width * 0.5 - 2, car.length + 4, car.width + 4, 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHumanoid(ctx, person, state, palette) {
  const p = worldToScreen(state, person.x, person.y);
  if (p.x < -60 || p.y < -60 || p.x > state.camera.width + 60 || p.y > state.camera.height + 60) return;
  const legSwing = Math.sin(person.animPhase || 0) * 2.2;
  ctx.fillStyle = "rgba(0,0,0,0.19)";
  ctx.beginPath();
  ctx.ellipse(p.x + 1.5, p.y + person.r * 0.76, person.r * 0.86, person.r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.legs;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - 2, p.y + 6);
  ctx.lineTo(p.x - 4 + legSwing, p.y + 12);
  ctx.moveTo(p.x + 2, p.y + 6);
  ctx.lineTo(p.x + 4 - legSwing, p.y + 12);
  ctx.stroke();
  ctx.fillStyle = palette.body;
  drawRoundedRect(ctx, p.x - 5, p.y - 2, 10, 11, 3);
  ctx.fill();
  ctx.fillStyle = palette.skin;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 6, 4.3, 0, Math.PI * 2);
  ctx.fill();
  if (palette.accent) {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(p.x - 5, p.y - 10, 10, 2.5);
  }
  if (person.weaponReady) {
    ctx.strokeStyle = "#1b1f28";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 1);
    ctx.lineTo(p.x + Math.cos(person.facing || 0) * 12, p.y - 1 + Math.sin(person.facing || 0) * 12);
    ctx.stroke();
  }
}

function drawBullets(ctx, state) {
  for (const bullet of state.bullets) {
    const a = worldToScreen(state, bullet.prevX, bullet.prevY);
    const b = worldToScreen(state, bullet.x, bullet.y);
    ctx.strokeStyle = bullet.team === "player" ? "rgba(255,227,144,0.85)" : "rgba(255,126,126,0.8)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawMissionMarker(ctx, state) {
  const marker = state.mission.marker;
  if (!marker) return;
  const p = worldToScreen(state, marker.x, marker.y);
  if (p.x > -200 && p.x < state.camera.width + 200 && p.y > -200 && p.y < state.camera.height + 200) {
    ctx.strokeStyle = "rgba(244, 216, 107, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, marker.radius, 0, Math.PI * 2);
    ctx.stroke();
    const pulse = 14 + Math.sin(state.time * 4.5) * 3;
    ctx.fillStyle = "#f2d36a";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - pulse);
    ctx.lineTo(p.x - 9, p.y - pulse - 16);
    ctx.lineTo(p.x + 9, p.y - pulse - 16);
    ctx.closePath();
    ctx.fill();
  }
}

function drawUi(ctx, canvas, state, assets) {
  const district = findDistrict(state.world, state.player.x, state.player.y);
  const strip = ctx.createLinearGradient(0, 0, canvas.width, 0);
  strip.addColorStop(0, "rgba(12,16,22,0.64)");
  strip.addColorStop(0.5, "rgba(24,29,39,0.52)");
  strip.addColorStop(1, "rgba(12,16,22,0.64)");
  ctx.fillStyle = strip;
  drawRoundedRect(ctx, 14, 12, canvas.width - 28, 48, 12);
  ctx.fill();

  const items = [
    state.player.inCarId ? "IN CAR" : "ON FOOT",
    `HEALTH ${Math.round(state.player.health)}`,
    `WANTED ${state.wanted.toFixed(1)}`,
    `CASH $${Math.round(state.player.money)}`,
    district.name,
    state.mission.current ? `${state.mission.current.name}: ${state.mission.stageLabel}` : "NO ACTIVE MISSION",
  ];

  let cursor = 28;
  ctx.font = "700 13px Georgia, serif";
  for (const item of items) {
    const width = Math.min(canvas.width - 52, ctx.measureText(item).width + 20);
    ctx.fillStyle = item === district.name ? "rgba(76,99,62,0.88)" : "rgba(35,40,52,0.82)";
    drawRoundedRect(ctx, cursor, 18, width, 22, 7);
    ctx.fill();
    ctx.fillStyle = "#efe5c6";
    ctx.textAlign = "left";
    ctx.fillText(item, cursor + 10, 33);
    cursor += width + 10;
    if (cursor > canvas.width - 240) break;
  }

  if (state.mission.toast) {
    ctx.fillStyle = "rgba(12,16,22,0.7)";
    drawRoundedRect(ctx, canvas.width * 0.5 - 180, canvas.height - 72, 360, 40, 10);
    ctx.fill();
    ctx.fillStyle = "#f5df99";
    ctx.textAlign = "center";
    ctx.font = "700 16px Georgia, serif";
    ctx.fillText(state.mission.toast.text, canvas.width * 0.5, canvas.height - 46);
  }

  if (state.wanted > 0.15) {
    ctx.fillStyle = "rgba(0,0,0,0.44)";
    ctx.fillRect(0, canvas.height - 18, canvas.width, 18);
    ctx.fillStyle = "#d65e5e";
    ctx.fillRect(0, canvas.height - 18, canvas.width * state.policePressure, 18);
  }

  const mapW = 252;
  const mapH = 190;
  const mapX = canvas.width - mapW - 18;
  const mapY = canvas.height - mapH - 18;
  ctx.fillStyle = "rgba(10,14,19,0.74)";
  drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 14);
  ctx.fill();
  if (assets.minimapFrame.complete && assets.minimapFrame.naturalWidth > 0) {
    ctx.drawImage(assets.minimapFrame, mapX, mapY, mapW, mapH);
  }
  const scaleX = (mapW - 26) / state.world.width;
  const scaleY = (mapH - 30) / state.world.height;
  const innerX = mapX + 13;
  const innerY = mapY + 14;
  ctx.fillStyle = "#2e3a2e";
  ctx.fillRect(innerX, innerY, mapW - 26, mapH - 30);
  for (const districtInfo of state.world.districts) {
    ctx.fillStyle =
      districtInfo.id === "residential" ? "rgba(114, 154, 102, 0.55)" :
      districtInfo.id === "downtown" ? "rgba(90, 120, 102, 0.55)" :
      "rgba(118, 112, 88, 0.55)";
    ctx.fillRect(innerX + districtInfo.x * scaleX, innerY + districtInfo.y * scaleY, districtInfo.w * scaleX, districtInfo.h * scaleY);
  }
  ctx.fillStyle = "#58616a";
  for (const road of state.world.roads) ctx.fillRect(innerX + road.x * scaleX, innerY + road.y * scaleY, Math.max(1, road.w * scaleX), Math.max(1, road.h * scaleY));
  ctx.fillStyle = "#6f7468";
  for (const building of state.world.buildings) ctx.fillRect(innerX + building.x * scaleX, innerY + building.y * scaleY, Math.max(1, building.w * scaleX), Math.max(1, building.h * scaleY));
  if (state.mission.marker) {
    ctx.fillStyle = "#f0cf71";
    ctx.beginPath();
    ctx.arc(innerX + state.mission.marker.x * scaleX, innerY + state.mission.marker.y * scaleY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#9ce283";
  ctx.beginPath();
  ctx.arc(innerX + state.player.x * scaleX, innerY + state.player.y * scaleY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff7e7e";
  for (const police of state.police.officers) ctx.fillRect(innerX + police.x * scaleX - 1, innerY + police.y * scaleY - 1, 3, 3);
  for (const policeCar of state.vehicles.filter((vehicle) => vehicle.kind === "police")) ctx.fillRect(innerX + policeCar.x * scaleX - 1, innerY + policeCar.y * scaleY - 1, 3, 3);
  ctx.strokeStyle = "rgba(210, 232, 255, 0.72)";
  ctx.strokeRect(innerX + state.camera.x * scaleX, innerY + state.camera.y * scaleY, state.camera.width * scaleX, state.camera.height * scaleY);
  ctx.fillStyle = "#efe5c6";
  ctx.font = "700 11px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText("SURVEILLANCE MAP", mapX + 18, mapY + 16);

  if (state.paused) {
    ctx.fillStyle = "rgba(0,0,0,0.46)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 48px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", canvas.width * 0.5, canvas.height * 0.5);
  }
}

export function renderGame(ctx, canvas, state, assets) {
  drawGround(ctx, canvas, state);
  drawRoads(ctx, canvas, state, assets);
  drawProps(ctx, state);
  drawBuildings(ctx, state, assets);
  drawMissionEntities(ctx, state);
  for (const vehicle of state.vehicles) drawVehicle(ctx, vehicle, state);
  for (const npc of state.civilians) drawHumanoid(ctx, npc, state, { body: npc.colors.body, legs: npc.colors.legs, skin: npc.colors.skin });
  for (const hostile of state.hostiles) drawHumanoid(ctx, hostile, state, { body: "#7d4343", legs: "#2f2424", skin: "#d0b090", accent: "#572828" });
  for (const officer of state.police.officers) drawHumanoid(ctx, officer, state, { body: "#244e7a", legs: "#15263d", skin: "#d5bea0", accent: "#1a273b" });
  if (!state.player.inCarId) drawHumanoid(ctx, state.player, state, { body: "#d2b958", legs: "#493b20", skin: "#e5c29f", accent: "#6e5731" });
  drawBullets(ctx, state);
  drawMissionMarker(ctx, state);
  drawUi(ctx, canvas, state, assets);
}
