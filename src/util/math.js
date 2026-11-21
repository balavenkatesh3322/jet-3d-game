import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const DEG = Math.PI / 180;
export const KTS = 1.94384; // m/s -> knots
export const FT = 3.28084;  // m -> ft

export const V_FWD = new THREE.Vector3(0, 0, -1);
export const V_UP = new THREE.Vector3(0, 1, 0);
export const V_RIGHT = new THREE.Vector3(1, 0, 0);

// Wrap angle into [-PI, PI]
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Heading in degrees (0 = north = -Z, clockwise)
export function headingOf(dir) {
  let h = Math.atan2(dir.x, -dir.z) / DEG;
  if (h < 0) h += 360;
  return h;
}

export function fmt(n, d = 0) { return Number(n).toFixed(d); }
