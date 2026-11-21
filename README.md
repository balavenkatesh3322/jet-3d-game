# Skyforge Strike II

A 3D jet combat game that runs in the browser (three.js). You launch from a carrier catapult or a runway, fight
alongside AI wingmen against fighters, SAMs, ships and convoys, and then land on the carrier wires or the runway.
The campaign runs through ocean, coast, jungle, mountain, desert, arctic and dusk theaters, and finishing stages
unlocks more advanced jets. All sound, music and radio chatter are generated in code, with no asset files.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Use a desktop browser with hardware WebGL (Chrome or Edge recommended). Click once to enable audio.

## Controls

| Key | Action |
|---|---|
| W / S (↑ / ↓) | Pitch (S = pull up; can be inverted in Settings) |
| A / D (← / →) | Roll |
| Q / E | Rudder |
| Shift / Ctrl | Throttle (above 100% = afterburner) |
| Space | Cannon |
| F | Fire selected missile |
| 1 / 2 / 3 / 4, R | IR missile / radar missile / AGM / gun, cycle |
| T | Cycle target |
| X | Flares |
| G | Gear + tail hook |
| B | Speed brake / wheel brakes |
| L | Auto-land |
| Tab | Wingman orders |
| C | Camera |
| V | Look back |
| H | Toggle help |
| Esc / P | Pause |

Gamepads are supported.

**Carrier launch:** hold Shift until throttle reaches MIL. The catapult fires automatically.
**Carrier trap:** gear down (G), fly about 1.3× stall speed, follow the ILS needles and the LSO calls, and touch down near the stern.

See [PLAN.md](PLAN.md) for the development plan and architecture.
