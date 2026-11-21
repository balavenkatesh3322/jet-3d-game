// Playable aircraft roster. Unlocked stage-by-stage through the campaign + credits.
// Performance numbers are game-tuned (m/s, m/s², rad/s), loosely inspired by the real airframes.
export const JETS = [
  {
    id: 'f16', name: 'F-16C Viper', role: 'Multirole fighter', unlockStage: 0, cost: 0,
    desc: 'Agile, forgiving lightweight fighter. Your first ride.',
    thrust: 13.5, abThrust: 23, dragK: 1.6e-4, stall: 62, vr: 72, maxG: 9, pitchRate: 1.35, rollRate: 3.6, yawRate: 0.35,
    health: 100, gun: 500, ir: 4, radar: 2, agm: 2, flares: 30, stealth: 0,
    model: { len: 15, span: 9.8, wing: 'trap', tails: 1, engines: 1, canards: false, intake: 'chin', sweep: 0.62 },
  },
  {
    id: 'fa18', name: 'F/A-18E Super Hornet', role: 'Carrier strike fighter', unlockStage: 1, cost: 2500,
    desc: 'Rugged carrier jet with a deep magazine. Great for strike missions.',
    thrust: 13, abThrust: 22, dragK: 1.7e-4, stall: 56, vr: 68, maxG: 7.6, pitchRate: 1.3, rollRate: 3.1, yawRate: 0.4,
    health: 130, gun: 578, ir: 4, radar: 4, agm: 4, flares: 40, stealth: 0,
    model: { len: 18.3, span: 13.6, wing: 'trap', tails: 2, tailCant: 0.35, engines: 2, canards: false, intake: 'side', sweep: 0.55 },
  },
  {
    id: 'su35', name: 'Su-35S Flanker-E', role: 'Super-maneuverable air superiority', unlockStage: 2, cost: 5000,
    desc: 'Thrust vectoring monster. Out-turns almost anything.',
    thrust: 14.5, abThrust: 25, dragK: 1.6e-4, stall: 50, vr: 70, maxG: 9.5, pitchRate: 1.75, rollRate: 3.4, yawRate: 0.6,
    health: 125, gun: 150, ir: 6, radar: 4, agm: 2, flares: 48, stealth: 0,
    model: { len: 21.9, span: 15.3, wing: 'trap', tails: 2, tailCant: 0.05, engines: 2, canards: true, intake: 'chin2', sweep: 0.7 },
  },
  {
    id: 'f15', name: 'F-15EX Eagle II', role: 'Heavy strike / interceptor', unlockStage: 3, cost: 8000,
    desc: 'Fastest jet in the hangar with an enormous missile load.',
    thrust: 15.5, abThrust: 28, dragK: 1.5e-4, stall: 64, vr: 75, maxG: 9, pitchRate: 1.25, rollRate: 3.2, yawRate: 0.35,
    health: 140, gun: 510, ir: 6, radar: 8, agm: 4, flares: 40, stealth: 0,
    model: { len: 19.4, span: 13, wing: 'cropped', tails: 2, tailCant: 0.0, engines: 2, canards: false, intake: 'side', sweep: 0.75 },
  },
  {
    id: 'f35', name: 'F-35C Lightning II', role: 'Stealth multirole', unlockStage: 4, cost: 12000,
    desc: 'Low observable: enemy radar locks take much longer.',
    thrust: 14, abThrust: 22, dragK: 1.7e-4, stall: 55, vr: 66, maxG: 7.5, pitchRate: 1.35, rollRate: 3.2, yawRate: 0.4,
    health: 120, gun: 180, ir: 4, radar: 6, agm: 4, flares: 36, stealth: 0.6,
    model: { len: 15.7, span: 13.1, wing: 'diamond', tails: 2, tailCant: 0.45, engines: 1, canards: false, intake: 'caret', sweep: 0.6 },
  },
  {
    id: 'f22', name: 'F-22A Raptor', role: 'Stealth air dominance', unlockStage: 5, cost: 18000,
    desc: 'Supercruise, thrust vectoring and stealth. The apex predator.',
    thrust: 17, abThrust: 27, dragK: 1.45e-4, stall: 52, vr: 70, maxG: 9.5, pitchRate: 1.7, rollRate: 3.8, yawRate: 0.55,
    health: 130, gun: 480, ir: 4, radar: 8, agm: 2, flares: 48, stealth: 0.75,
    model: { len: 18.9, span: 13.6, wing: 'diamond', tails: 2, tailCant: 0.45, engines: 2, canards: false, intake: 'caret', sweep: 0.7 },
  },
  {
    id: 'su57', name: 'Su-57 Felon', role: '5th-gen super-maneuverable', unlockStage: 6, cost: 24000,
    desc: 'Stealthy and absurdly agile with all-moving tails.',
    thrust: 17.5, abThrust: 28, dragK: 1.45e-4, stall: 48, vr: 68, maxG: 10, pitchRate: 1.9, rollRate: 3.9, yawRate: 0.7,
    health: 135, gun: 150, ir: 6, radar: 8, agm: 4, flares: 56, stealth: 0.6,
    model: { len: 20.1, span: 14.1, wing: 'diamond', tails: 2, tailCant: 0.4, engines: 2, canards: true, intake: 'chin2', sweep: 0.72 },
  },
  {
    id: 'xf9', name: 'XF-9 Nightblade', role: 'Experimental 6th-gen prototype', unlockStage: 8, cost: 40000,
    desc: 'Tailless prototype. Unlocked by finishing the campaign.',
    thrust: 20, abThrust: 32, dragK: 1.35e-4, stall: 46, vr: 66, maxG: 11, pitchRate: 2.0, rollRate: 4.2, yawRate: 0.7,
    health: 160, gun: 600, ir: 8, radar: 10, agm: 6, flares: 64, stealth: 0.85,
    model: { len: 21, span: 15, wing: 'flying', tails: 0, engines: 2, canards: false, intake: 'caret', sweep: 0.85 },
  },
];

export const LIVERIES = [
  { id: 'grey', name: 'Air Superiority Grey', base: 0x7d8590, alt: 0x5c636d, accent: 0x22d3ee },
  { id: 'navy', name: 'Navy Gloss', base: 0x9aa3ad, alt: 0x6f7883, accent: 0xfacc15 },
  { id: 'dark', name: 'Night Ops Black', base: 0x24272c, alt: 0x15171a, accent: 0xef4444 },
  { id: 'desert', name: 'Desert Camo', base: 0xb59a6a, alt: 0x8a6f45, accent: 0xf97316 },
  { id: 'jungle', name: 'Jungle Camo', base: 0x56663f, alt: 0x37422a, accent: 0x84cc16 },
  { id: 'arctic', name: 'Arctic Splinter', base: 0xdfe5ea, alt: 0x9aa7b3, accent: 0x38bdf8 },
];

export const ENEMY_JETS = [
  { name: 'MiG-29 Fulcrum', skill: 0.4, base: 0x6b7a6a, alt: 0x4b5a4a, accent: 0xdc2626, model: { len: 17.3, span: 11.4, wing: 'trap', tails: 2, tailCant: 0.1, engines: 2, intake: 'chin2', sweep: 0.62 } },
  { name: 'Su-27 Flanker', skill: 0.55, base: 0x7a8ea0, alt: 0x4d6274, accent: 0xdc2626, model: { len: 21.9, span: 14.7, wing: 'trap', tails: 2, tailCant: 0.05, engines: 2, intake: 'chin2', sweep: 0.68 } },
  { name: 'J-10 Firebird', skill: 0.55, base: 0x8a8f96, alt: 0x5e636a, accent: 0xdc2626, model: { len: 16.9, span: 9.7, wing: 'delta', tails: 1, engines: 1, canards: true, intake: 'chin', sweep: 0.8 } },
  { name: 'Su-57 Felon', skill: 0.75, base: 0x3f4a5a, alt: 0x2a3340, accent: 0xdc2626, model: { len: 20.1, span: 14.1, wing: 'diamond', tails: 2, tailCant: 0.4, engines: 2, canards: true, intake: 'chin2', sweep: 0.72 } },
  { name: 'J-20 Mighty Dragon', skill: 0.85, base: 0x2a2e33, alt: 0x1a1d21, accent: 0xb91c1c, model: { len: 20.4, span: 13, wing: 'delta', tails: 2, tailCant: 0.4, engines: 2, canards: true, intake: 'caret', sweep: 0.8 } },
];
