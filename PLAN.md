# Skyforge Strike II — Development Plan

The next version of the reference build (`tvdl-x-luminabench-1282p.mp4`): a browser three.js carrier-jet game
with a chase camera, HUD, radar, flares and missiles. v2 keeps that look and adds a full campaign, unlockable
aircraft, several theaters, takeoff and landing on both carriers and runways, radio chatter, and a generated soundtrack.

## 1. What the reference had → what v2 adds

| Area | Reference (v1) | Skyforge Strike II (v2) |
|---|---|---|
| Theaters | Open ocean + carrier | 7 theaters: ocean, coast, jungle, mountains, desert, arctic sunset, dusk ridge |
| Bases | Carrier deck | Carrier (catapult, 4 arresting wires, LSO, meatball) **and** land airbase (runway, PAPI, tower) |
| Takeoff | Catapult launch | Catapult (throttle to MIL → auto-launch) and runway roll + rotation |
| Landing | — | Manual landing with ICLS/ILS needles, LSO and tower calls, bolters, wire grading, **auto-land (L)** |
| Aircraft | 1 jet | 8 jets (F-16C → F/A-18E → Su-35S → F-15EX → F-35C → F-22A → Su-57 → XF-9), 6 liveries, callsign |
| Progression | — | 8-stage campaign, stars, credits, hangar purchases, stage-gated unlocks, local save |
| Enemies | Fighters | 5 fighter tiers incl. "Black Dragon" aces, SAM sites, AAA flak, radars, frigates, convoys, fuel depots, HQ |
| Friendly | — | 1–3 AI wingmen that take off with you, fly formation and follow orders (Tab: engage / cover / attack my target) |
| Weapons | Gun, missiles, flares | Gun with lead-computing pipper, IR AAM (seeker growl), radar AAM, AGM, flares with per-salvo decoy chance |
| Audio | SFX | Fully procedural engine/afterburner/wind/gun/explosions, lock and RWR tones, radio voices (Web Speech + squelch), "Betty" warnings, adaptive music |
| Cameras | Chase, deck | Chase, cockpit, far chase, target-lock padlock, cinematic fly-by, look-back |
| FX | Exhaust, sun | Ocean reflections, sky with clouds, lens flare, bloom, shadows, missile smoke, explosions, wrecks, wingtip vapor, transonic vapor cone, G-LOC blackout, cloud white-out |

## 2. Architecture (`src/`)

```
core/      Game.js (renderer, post-FX, cameras, loop, state machine), input.js (keyboard + gamepad), save.js
data/      jets.js (roster, liveries, enemy types), theaters.js (look + terrain presets), stages.js (campaign)
world/     World.js (sky, sun, ocean, env map, lens flare), Terrain.js (procedural heightmap + collision),
           Clouds.js (instanced billboards), Bases.js (carrier, airbase, warships)
aircraft/  JetModel.js (procedural airframe builder), Aircraft.js (flight model, ground/catapult/arrest, damage)
combat/    Combat.js (missiles, guns, flares, explosions, damage), Particles.js (GPU point sprites)
ai/        Pilot.js (AI dogfighting, evasion, formation, takeoff), GroundUnits.js (SAM/AAA/radar/ships/convoys)
game/      Mission.js (spawning, objectives, scoring, radio script, player weapons, ILS + auto-land)
audio/     AudioEngine.js (procedural SFX), Music.js (generative score), Radio.js (voice comms + subtitles)
ui/        HUD.js (canvas HUD + DOM overlays), Menus.js (all menu screens)
```

## 3. Flight model (Aircraft.js)
- Stick commands angular rates, scaled by control authority (dynamic pressure) and limited by **max G**.
- Speed changes with thrust (MIL/AB), parasitic + induced drag (∝ G²), gear and speed-brake drag, and gravity along the path.
- Lift only cancels gravity with wings level and above stall speed. Banking without pulling makes the nose slice down; slow flight stalls.
- The velocity vector lags the nose (AoA), giving the HUD flight-path marker and an energy-fight feel.
- Ground mode handles the catapult hold/launch, takeoff rotation at Vr, touchdown checks (sink rate, bank, pitch, gear), the wire trap, bolters, braking and deck overrun.

## 4. Milestones

| # | Milestone | Status |
|---|---|---|
| M1 | Renderer, sky, ocean, terrain, carrier, jet model, chase cam | ✅ |
| M2 | Flight model, catapult/runway takeoff, landing + wires | ✅ |
| M3 | Weapons, particles, explosions, damage, flares | ✅ |
| M4 | AI fighters, wingmen, ground/naval units | ✅ |
| M5 | HUD, radar, ILS, auto-land, radio, audio, music | ✅ |
| M6 | Campaign (8 stages), hangar unlocks, skirmish, settings, save | ✅ |
| M7 | Next: glTF hi-poly jet models + PBR textures, recorded voice packs, multiplayer co-op (WebRTC), VR cockpit, replay system, mobile touch controls, more theaters (night with NVG) | 🔜 |

## 5. Testing
`window.__game.simulate(seconds)` advances the sim headlessly (used to verify catapult → combat → auto-land →
3-wire trap → debrief and unlocks). `mission.debugPilot = (m, dt) => {...}` lets scripts fly the player jet.
