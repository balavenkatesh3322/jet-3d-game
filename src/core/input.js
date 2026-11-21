// Keyboard + gamepad input, exposed as normalized axes and edge-triggered actions.
import { clamp } from '../util/math.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.axes = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
    this.invertPitch = false;
    this.mouse = { x: 0, y: 0, active: false };
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this._smooth = { pitch: 0, roll: 0, yaw: 0 };
    this.gpPrev = {};
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  // Called once per frame before game logic.
  update(dt) {
    const k = (c) => (this.keys.has(c) ? 1 : 0);
    let pitch = (k('KeyS') + k('ArrowDown')) - (k('KeyW') + k('ArrowUp'));
    let roll = (k('KeyD') + k('ArrowRight')) - (k('KeyA') + k('ArrowLeft'));
    let yaw = k('KeyE') - k('KeyQ');
    let throttle = (k('ShiftLeft') + k('ShiftRight')) - (k('ControlLeft') + k('ControlRight'));
    if (this.invertPitch) pitch = -pitch;

    // keyboard smoothing (gives analog feel)
    const s = this._smooth;
    const rate = 7;
    s.pitch += (clamp(pitch, -1, 1) - s.pitch) * Math.min(1, rate * dt);
    s.roll += (clamp(roll, -1, 1) - s.roll) * Math.min(1, rate * 1.4 * dt);
    s.yaw += (clamp(yaw, -1, 1) - s.yaw) * Math.min(1, rate * dt);
    this.axes.pitch = s.pitch; this.axes.roll = s.roll; this.axes.yaw = s.yaw;
    this.axes.throttle = clamp(throttle, -1, 1);

    // Gamepad (standard mapping)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0);
      if (lx || ly) { this.axes.roll = lx; this.axes.pitch = this.invertPitch ? -ly : ly; }
      if (rx) this.axes.yaw = rx;
      const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
      if (rt > 0.1 || lt > 0.1) this.axes.throttle = rt - lt;
      const map = { 0: 'Space', 1: 'KeyF', 2: 'KeyX', 3: 'KeyT', 4: 'KeyQ', 5: 'KeyE', 8: 'KeyC', 9: 'Escape', 12: 'KeyG', 13: 'KeyB', 14: 'Digit1', 15: 'Digit2', 10: 'KeyL', 11: 'KeyV' };
      for (const [i, code] of Object.entries(map)) {
        const b = gp.buttons[i]?.pressed;
        if (b) { if (!this.gpPrev[i]) this.pressed.add(code); this.keys.add(code); }
        else if (this.gpPrev[i]) this.keys.delete(code);
        this.gpPrev[i] = b;
      }
    }
  }

  endFrame() { this.pressed.clear(); }
}
