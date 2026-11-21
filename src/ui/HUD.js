// Canvas-drawn heads-up display + DOM overlays (messages, subtitles, banners, objectives).
import * as THREE from 'three';
import { clamp, DEG, KTS, FT, headingOf } from '../util/math.js';
import { WEAPONS } from '../combat/Combat.js';

const GREEN = '#6dffb0';
const RED = '#ff4d4d';
const ORANGE = '#ffb347';
const BLUE = '#6ec8ff';

const _v = new THREE.Vector3();
const _e = new THREE.Euler();

export class HUD {
  constructor(root) {
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hud-canvas';
    root.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
    root.insertAdjacentHTML('beforeend', `
      <div id="hud-dom">
        <div class="hud-tl"><span id="hud-fps" class="chip">-- FPS</span> <span id="hud-zone" class="chip"></span>
          <div id="hud-obj" class="panel obj"></div></div>
        <div class="hud-tr"><span class="chip" id="hud-cam">CAM: CHASE [C]</span> <span class="chip">PAUSE [ESC]</span>
          <div id="hud-msgs"></div></div>
        <div id="hud-banner"><div class="b1"></div><div class="b2"></div></div>
        <div id="hud-sub"></div>
        <div id="hud-warn"></div>
        <div id="hud-keys" class="keys">
          <span><b>W/S</b> Pitch</span><span><b>A/D</b> Roll</span><span><b>Q/E</b> Rudder</span><span><b>Shift/Ctrl</b> Throttle</span>
          <span><b>Space</b> Gun</span><span><b>F</b> Missile</span><span><b>1-3</b> Weapon</span><span><b>T</b> Target</span><span><b>X</b> Flares</span>
          <span><b>G</b> Gear</span><span><b>B</b> Brake</span><span><b>L</b> Auto-land</span><span><b>Tab</b> Wingmen</span><span><b>C</b> Camera</span><span><b>H</b> Hide help</span>
        </div>
        <div id="hud-vignette"></div><div id="hud-gloc"></div><div id="hud-white"></div>
      </div>`);
    this.el = {
      fps: root.querySelector('#hud-fps'), zone: root.querySelector('#hud-zone'), obj: root.querySelector('#hud-obj'),
      cam: root.querySelector('#hud-cam'), msgs: root.querySelector('#hud-msgs'), banner: root.querySelector('#hud-banner'),
      sub: root.querySelector('#hud-sub'), warn: root.querySelector('#hud-warn'), keys: root.querySelector('#hud-keys'),
      vig: root.querySelector('#hud-vignette'), gloc: root.querySelector('#hud-gloc'), white: root.querySelector('#hud-white'),
    };
    this.bannerT = 0;
    this.subT = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.visible = false;
    this.fpsAcc = 0; this.fpsN = 0;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
  }

  show(v) { this.visible = v; this.root.style.display = v ? 'block' : 'none'; }

  message(text, kind = 'info') {
    const d = document.createElement('div');
    d.className = 'msg ' + kind; d.textContent = text;
    this.el.msgs.prepend(d);
    while (this.el.msgs.children.length > 5) this.el.msgs.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 4000);
    setTimeout(() => d.remove(), 5000);
  }

  banner(big, small = '', time = 3) {
    this.el.banner.querySelector('.b1').textContent = big;
    this.el.banner.querySelector('.b2').textContent = small;
    this.el.banner.classList.add('on');
    this.bannerT = time;
  }

  subtitle({ name, text, color, warn }) {
    this.el.sub.innerHTML = `<b style="color:${color}">${name}:</b> ${text}`;
    this.el.sub.classList.add('on');
    this.el.sub.classList.toggle('warn', !!warn);
    this.subT = 2.5 + text.length * 0.06;
  }

  setObjectives(list) {
    this.el.obj.innerHTML = '<div class="h">OBJECTIVES</div>' + list.map((o) => `<div class="${o.done ? 'done' : ''}">${o.done ? '✔' : '▢'} ${o.text}${o.progress ? ` <i>${o.progress}</i>` : ''}</div>`).join('');
  }

  // ------------------------------------------------------------------ per frame
  update(dt, s) {
    if (!this.visible) return;
    const now = performance.now();
    this.fpsT0 = this.fpsT0 || now; this.fpsN++;
    if (now - this.fpsT0 > 500) { this.el.fps.textContent = Math.round(this.fpsN * 1000 / (now - this.fpsT0)) + ' FPS'; this.fpsT0 = now; this.fpsN = 0; }
    this.el.fps.style.display = s.showFps ? '' : 'none';
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('on'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.sub.classList.remove('on'); }
    this.el.zone.textContent = s.zone;
    this.el.zone.className = 'chip ' + (s.zoneWarn ? 'red' : '');
    this.el.cam.textContent = 'CAM: ' + s.camName + ' [C]';

    const p = s.player;
    // screen effects
    const g = p.gload;
    this.el.gloc.style.opacity = clamp((g - 7.5) / 4, 0, 0.85) + clamp((-g - 2.5) / 3, 0, 0.6);
    this.el.gloc.style.background = g < -2 ? 'radial-gradient(ellipse at center, transparent 30%, rgba(120,0,0,0.9) 100%)' : '';
    this.el.vig.style.opacity = s.damageFlash;
    this.el.white.style.opacity = s.cloud * 0.75;

    // warnings
    let warn = '';
    if (s.missileInbound) warn = 'MISSILE INBOUND';
    else if (s.pullUp) warn = 'PULL UP';
    else if (s.stall) warn = 'STALL';
    else if (s.lockedOn) warn = 'ENEMY LOCK';
    else if (s.zoneWarn) warn = 'RETURN TO COMBAT AREA';
    this.el.warn.textContent = warn;
    this.el.warn.classList.toggle('on', !!warn && (performance.now() % 600 < 380));

    this.draw(s);
  }

  draw(s) {
    const ctx = this.g, dpr = this.dpr;
    const W = innerWidth, H = innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const p = s.player, cam = s.camera;
    const cx = W / 2, cy = H / 2;
    const col = s.cockpit ? GREEN : 'rgba(140,255,200,0.92)';
    ctx.lineWidth = 1.5;
    ctx.font = '600 13px "Rajdhani", "Segoe UI", sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3;

    // ---------------- target markers (3D -> screen)
    for (const t of s.contacts) this.drawContact(ctx, t, s, W, H);

    // ---------------- pitch ladder + FPM (only if not on ground)
    _e.setFromQuaternion(p.quat, 'YXZ');
    const pitch = _e.x, roll = _e.z;
    const pxPerRad = H / (cam.fov * DEG);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - 220, cy - 200, 440, 400); ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-roll);
    ctx.strokeStyle = col; ctx.fillStyle = col;
    for (let a = -90; a <= 90; a += 5) {
      if (a === 0) continue;
      const y = (pitch - a * DEG) * pxPerRad;
      if (Math.abs(y) > 260) continue;
      const w = a % 10 === 0 ? 70 : 40;
      ctx.setLineDash(a < 0 ? [6, 5] : []);
      ctx.beginPath(); ctx.moveTo(-w - 40, y); ctx.lineTo(-40, y); ctx.moveTo(40, y); ctx.lineTo(w + 40, y); ctx.stroke();
      ctx.setLineDash([]);
      if (a % 10 === 0) { ctx.fillText(String(Math.abs(a)), -w - 62, y + 4); ctx.fillText(String(Math.abs(a)), w + 46, y + 4); }
    }
    // horizon
    const hy = pitch * pxPerRad;
    ctx.beginPath(); ctx.moveTo(-200, hy); ctx.lineTo(-40, hy); ctx.moveTo(40, hy); ctx.lineTo(200, hy); ctx.stroke();
    ctx.restore();

    // boresight
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy - 12); ctx.stroke();
    // flight path marker
    _v.copy(p.pos).addScaledVector(p.vel.lengthSq() > 1 ? p.vel.clone().normalize() : p.getForward(new THREE.Vector3()), 1000).project(cam);
    if (_v.z < 1) {
      const fx = (_v.x * 0.5 + 0.5) * W, fy = (-_v.y * 0.5 + 0.5) * H;
      ctx.beginPath(); ctx.arc(fx, fy, 7, 0, Math.PI * 2);
      ctx.moveTo(fx - 7, fy); ctx.lineTo(fx - 18, fy); ctx.moveTo(fx + 7, fy); ctx.lineTo(fx + 18, fy); ctx.moveTo(fx, fy - 7); ctx.lineTo(fx, fy - 14); ctx.stroke();
    }

    // gun pipper (lead computing)
    if (s.weapon === 'gun' && s.target && s.target.isAir) {
      const t = s.target;
      const d = t.pos.distanceTo(p.pos);
      if (d < 2000) {
        const tof = d / 1050;
        _v.copy(t.pos).addScaledVector(t.vel, tof).addScaledVector(p.vel, -tof).add(new THREE.Vector3(0, 4.9 * tof * tof, 0)).project(cam);
        if (_v.z < 1) {
          const gx = (_v.x * 0.5 + 0.5) * W, gy = (-_v.y * 0.5 + 0.5) * H;
          ctx.strokeStyle = d < 900 ? RED : col;
          ctx.beginPath(); ctx.arc(gx, gy, 16, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(gx, gy, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(gx, gy, 22, -Math.PI / 2, -Math.PI / 2 + (Math.max(0, 2000 - d) / 2000) * Math.PI * 2); ctx.stroke();
        }
      }
    }

    // seeker circle
    if (s.weapon !== 'gun') {
      const w = WEAPONS[s.weapon];
      const r = Math.tan(w.cone * DEG) * (H / 2) / Math.tan((cam.fov * DEG) / 2);
      ctx.strokeStyle = s.locked ? RED : 'rgba(140,255,200,0.35)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---------------- heading tape
    const hd = headingOf(p.getForward(new THREE.Vector3()));
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.save(); ctx.beginPath(); ctx.rect(cx - 160, 40, 320, 34); ctx.clip();
    for (let a = Math.floor(hd / 5) * 5 - 40; a <= hd + 40; a += 5) {
      const x = cx + (a - hd) * 4;
      const big = a % 10 === 0;
      ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x, big ? 58 : 64); ctx.stroke();
      if (a % 30 === 0) { const v = ((a % 360) + 360) % 360; const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[v] ?? String(v / 10).padStart(2, '0'); ctx.textAlign = 'center'; ctx.fillText(lbl, x, 54); }
    }
    ctx.restore();
    ctx.textAlign = 'center';
    this.box(ctx, cx - 24, 18, 48, 20, col); ctx.fillText(String(Math.round(hd)).padStart(3, '0'), cx, 33);
    ctx.beginPath(); ctx.moveTo(cx, 72); ctx.lineTo(cx - 5, 80); ctx.lineTo(cx + 5, 80); ctx.closePath(); ctx.fill();

    // ---------------- speed / alt boxes
    const kts = p.speed * KTS;
    const altFt = p.pos.y * FT;
    const agl = s.agl * FT;
    ctx.textAlign = 'right';
    ctx.font = '700 20px "Rajdhani", sans-serif';
    this.box(ctx, cx - 300, cy - 18, 90, 34, col); ctx.fillText(Math.round(kts), cx - 218, cy + 7);
    ctx.textAlign = 'left';
    this.box(ctx, cx + 210, cy - 18, 100, 34, col); ctx.fillText(Math.round(altFt), cx + 220, cy + 7);
    ctx.font = '600 13px "Rajdhani", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('KTS', cx - 218, cy - 24);
    ctx.fillText(`M ${(p.speed / 340).toFixed(2)}`, cx - 218, cy + 36);
    ctx.fillText(`G ${p.gload.toFixed(1)}`, cx - 218, cy + 52);
    ctx.fillText(`AOA ${(p.aoa / DEG).toFixed(1)}`, cx - 218, cy + 68);
    ctx.textAlign = 'left';
    ctx.fillText('ALT FT', cx + 220, cy - 24);
    ctx.fillText(`R ${Math.round(agl)}`, cx + 220, cy + 36);
    ctx.fillText(`VS ${Math.round(p.vel.y * FT * 60)}`, cx + 220, cy + 52);
    // throttle bar
    const thx = cx - 330, thy = cy - 60;
    ctx.strokeStyle = col; ctx.strokeRect(thx, thy, 10, 120);
    const tv = clamp(p.throttle / 1.2, 0, 1);
    ctx.fillStyle = p.throttle > 1 ? ORANGE : col;
    ctx.fillRect(thx + 2, thy + 118 - tv * 116, 6, tv * 116);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(thx - 3, thy + 120 - (1 / 1.2) * 120); ctx.lineTo(thx + 13, thy + 120 - (1 / 1.2) * 120); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(p.throttle > 1 ? 'AB' : Math.round(p.throttle * 100) + '%', thx + 5, thy + 136);
    // status flags
    ctx.textAlign = 'left';
    let fy = cy + 90;
    const flags = [];
    if (p.gearDown) flags.push(['GEAR DN' + (s.isCarrier ? ' / HOOK' : ''), ORANGE]);
    if (p.airbrake) flags.push(['SPD BRK', ORANGE]);
    if (s.autoLand) flags.push(['AUTO-LAND', BLUE]);
    if (p.grounded && p.catapult) flags.push([p.catapult.state === 'hold' ? 'CAT: THROTTLE MIL/AB' : 'CAT LAUNCH', ORANGE]);
    for (const [txt, c] of flags) { ctx.fillStyle = c; ctx.fillText(txt, cx - 330, fy); fy += 16; }

    // ---------------- landing guidance (ILS)
    if (s.ils) this.drawILS(ctx, s.ils, cx, cy, col);

    // ---------------- radar
    this.drawRadar(ctx, s, 110, H - 120);
    // ---------------- weapons panel
    this.drawWeapons(ctx, s, W - 250, H - 190);
  }

  box(ctx, x, y, w, h, col) {
    ctx.fillStyle = 'rgba(0,20,10,0.35)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = col; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = col;
  }

  drawContact(ctx, t, s, W, H) {
    const cam = s.camera;
    _v.copy(t.e.pos).project(cam);
    const behind = _v.z > 1;
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    const on = !behind && x > 20 && x < W - 20 && y > 20 && y < H - 20;
    const color = t.friendly ? BLUE : t.e.isAir ? RED : ORANGE;
    ctx.strokeStyle = color; ctx.fillStyle = color;
    if (!on) {
      if (!t.selected) return;
      // edge arrow
      let dx = x - W / 2, dy = y - H / 2;
      if (behind) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx);
      const r = Math.min(W, H) * 0.42;
      const ax = W / 2 + Math.cos(a) * r, ay = H / 2 + Math.sin(a) * r;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath();
      t.selected ? ctx.fill() : ctx.stroke();
      ctx.restore();
      return;
    }
    const sz = t.selected ? 20 : 12;
    if (t.friendly) {
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(t.e.name, x, y - 12);
      return;
    }
    if (t.e.isAir) ctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz);
    else { ctx.beginPath(); ctx.moveTo(x, y - sz / 1.4); ctx.lineTo(x + sz / 1.4, y); ctx.lineTo(x, y + sz / 1.4); ctx.lineTo(x - sz / 1.4, y); ctx.closePath(); ctx.stroke(); }
    if (t.selected) {
      ctx.textAlign = 'left';
      ctx.fillText(`${t.e.name}`, x + sz / 2 + 6, y - 4);
      ctx.fillText(`${(t.dist / 1000).toFixed(1)} km`, x + sz / 2 + 6, y + 10);
      if (s.locked) {
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, sz + 4, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.textAlign = 'center'; ctx.fillText('LOCK', x, y + sz + 18);
      } else if (s.lockProgress > 0) {
        const r = sz + 20 - s.lockProgress * 16;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (t.dist < 6000) {
      ctx.textAlign = 'center'; ctx.font = '600 11px "Rajdhani", sans-serif';
      ctx.fillText(`${(t.dist / 1000).toFixed(1)}`, x, y + sz / 2 + 12);
      ctx.font = '600 13px "Rajdhani", sans-serif';
    }
    if (t.objective && !t.selected) { ctx.textAlign = 'center'; ctx.fillText('TGT', x, y - sz / 2 - 4); }
  }

  drawILS(ctx, ils, cx, cy, col) {
    const w = 160;
    ctx.strokeStyle = 'rgba(110,200,255,0.9)'; ctx.fillStyle = 'rgba(110,200,255,0.95)';
    ctx.strokeRect(cx - w / 2, cy - w / 2, w, w);
    for (let i = -2; i <= 2; i++) {
      if (!i) continue;
      ctx.beginPath(); ctx.arc(cx + i * w / 6, cy + w / 2 - 6, 2, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + w / 2 - 6, cy + i * w / 6, 2, 0, 6.28); ctx.fill();
    }
    const lx = cx + clamp(ils.loc, -1, 1) * w / 2.2;
    const gy = cy + clamp(-ils.gs, -1, 1) * w / 2.2;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(lx, cy - w / 2); ctx.lineTo(lx, cy + w / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w / 2, gy); ctx.lineTo(cx + w / 2, gy); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.textAlign = 'center';
    ctx.fillText(`${ils.name}  ${(ils.dist / 1000).toFixed(1)} km  •  TGT ${Math.round(ils.targetSpeed * KTS)} KTS`, cx, cy - w / 2 - 8);
    if (ils.hint) { ctx.fillStyle = ORANGE; ctx.fillText(ils.hint, cx, cy + w / 2 + 18); }
  }

  drawRadar(ctx, s, x, y) {
    const R = 88, range = s.radarRange;
    ctx.save();
    ctx.fillStyle = 'rgba(0,18,12,0.55)';
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(110,255,170,0.5)';
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, R / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - R, y); ctx.lineTo(x + R, y); ctx.moveTo(x, y - R); ctx.lineTo(x, y + R); ctx.stroke();
    // sweep
    const sweep = (performance.now() / 1000) * 2.4;
    const grd = ctx.createConicGradient ? ctx.createConicGradient(sweep - Math.PI / 2, x, y) : null;
    if (grd) {
      grd.addColorStop(0, 'rgba(110,255,170,0.35)'); grd.addColorStop(0.12, 'rgba(110,255,170,0)'); grd.addColorStop(1, 'rgba(110,255,170,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    }
    const p = s.player;
    const fwd = p.getForward(new THREE.Vector3());
    const hdg = Math.atan2(fwd.x, -fwd.z);
    const plot = (pos, color, size, shape = 'dot') => {
      const east = pos.x - p.pos.x, north = -(pos.z - p.pos.z);
      const rx = east * Math.cos(hdg) - north * Math.sin(hdg);   // to the right of the nose
      const ry = east * Math.sin(hdg) + north * Math.cos(hdg);   // ahead of the nose
      let px = rx / range * R, py = -ry / range * R;
      const l = Math.hypot(px, py);
      if (l > R - 3) { px *= (R - 3) / l; py *= (R - 3) / l; }
      ctx.fillStyle = color; ctx.strokeStyle = color;
      if (shape === 'tri') { ctx.beginPath(); ctx.moveTo(x + px, y + py - size); ctx.lineTo(x + px + size, y + py + size); ctx.lineTo(x + px - size, y + py + size); ctx.closePath(); ctx.fill(); }
      else if (shape === 'sq') ctx.fillRect(x + px - size, y + py - size, size * 2, size * 2);
      else { ctx.beginPath(); ctx.arc(x + px, y + py, size, 0, Math.PI * 2); ctx.fill(); }
    };
    for (const t of s.contacts) {
      if (t.friendly) plot(t.e.pos, BLUE, 3);
      else if (t.e.isAir) plot(t.e.pos, t.selected ? '#fff' : RED, t.selected ? 4 : 3, 'tri');
      else plot(t.e.pos, ORANGE, 2.5, 'sq');
    }
    for (const m of s.missiles) plot(m.pos, m.team === 'red' ? '#ff9b9b' : '#ffffff', 1.5);
    if (s.basePos) plot(s.basePos, '#7cf', 4, 'sq');
    // own ship
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 4, y + 5); ctx.lineTo(x - 4, y + 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(140,255,200,0.9)'; ctx.textAlign = 'center'; ctx.font = '600 11px sans-serif';
    ctx.fillText(`${Math.round(range / 1000)} km`, x, y + R + 14);
    ctx.restore();
  }

  drawWeapons(ctx, s, x, y) {
    const p = s.player;
    ctx.save();
    ctx.fillStyle = 'rgba(5,15,20,0.6)'; ctx.fillRect(x, y, 230, 170);
    ctx.strokeStyle = 'rgba(110,255,170,0.35)'; ctx.strokeRect(x, y, 230, 170);
    ctx.font = '700 13px "Rajdhani", sans-serif';
    const hp = p.health / p.maxHealth;
    ctx.fillStyle = '#cfe'; ctx.textAlign = 'left';
    ctx.fillText(`HULL ${Math.round(hp * 100)}%`, x + 12, y + 20);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 12, y + 26, 206, 6);
    ctx.fillStyle = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#facc15' : '#ef4444'; ctx.fillRect(x + 12, y + 26, 206 * hp, 6);
    const rows = [['gun', 'GUN 20MM', p.ammo.gun, '[Space]'], ['ir', WEAPONS.ir.name, p.ammo.ir, '[1]'], ['radar', WEAPONS.radar.name, p.ammo.radar, '[2]'], ['agm', WEAPONS.agm.name, p.ammo.agm, '[3]']];
    rows.forEach(([k, name, n, key], i) => {
      const yy = y + 54 + i * 20;
      const sel = s.weapon === k;
      if (sel) { ctx.fillStyle = 'rgba(110,255,170,0.18)'; ctx.fillRect(x + 6, yy - 14, 218, 19); }
      ctx.fillStyle = n > 0 ? (sel ? '#7fffbf' : '#cde') : '#f87171';
      ctx.fillText(`${sel ? '▶ ' : '  '}${name}`, x + 12, yy);
      ctx.textAlign = 'right'; ctx.fillText(`${n}  ${key}`, x + 218, yy); ctx.textAlign = 'left';
    });
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`FLARES ${p.ammo.flares}  [X]`, x + 12, y + 140);
    ctx.fillStyle = '#9fb';
    ctx.fillText(`KILLS ${s.kills}   SCORE ${s.score}`, x + 12, y + 160);
    ctx.restore();
  }
}
