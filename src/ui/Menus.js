// DOM menu system: main menu, campaign map, briefing, hangar (unlocks/liveries), skirmish,
// settings, controls, pause and debrief.
import { JETS, LIVERIES, ENEMY_JETS } from '../data/jets.js';
import { STAGES, SKIRMISH_THEATERS } from '../data/stages.js';
import { THEATERS } from '../data/theaters.js';
import { resetSave } from '../core/save.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = (n, max = 3) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(max - n) + '</span>';

function statBars(j) {
  const max = JETS[JETS.length - 1];
  const rows = [
    ['Top speed', Math.sqrt(j.abThrust / j.dragK) / Math.sqrt(max.abThrust / max.dragK)],
    ['Agility', (j.pitchRate * j.rollRate) / (2.0 * 4.2)],
    ['Armor', j.health / 160],
    ['Payload', (j.ir + j.radar + j.agm) / 24],
    ['Stealth', j.stealth],
  ];
  return rows.map(([n, v]) => `<div class="stat"><span>${n}</span><div class="bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div></div>`).join('');
}

export class Menus {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.returnTo = 'main';
    this.skirmish = { theater: 'sea', enemies: 4, tier: 1, wingmen: 2, ground: true };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.game.audio.init();
      this.game.audio.play('click');
      this.act(b.dataset.act, b.dataset);
    });
  }

  get save() { return this.game.save; }

  hide() { this.root.innerHTML = ''; this.root.style.display = 'none'; }

  show(screen, data) {
    this.root.style.display = 'block';
    this.screen = screen;
    const html = this[`render_${screen}`](data);
    this.root.innerHTML = html;
    this.after?.(); this.after = null;
  }

  frame(inner, cls = '') {
    return `<div class="menu ${cls}">
      <div class="brand"><div class="logo">SKYFORGE <b>STRIKE</b> <span>II</span></div>
      <div class="sub">Carrier Air Wing • Realistic Combat Flight</div></div>
      <div class="credits">✦ ${this.save.credits.toLocaleString()} CR <span class="cs">PILOT: ${esc(this.save.callsign)}</span></div>
      ${inner}</div>`;
  }

  render_main() {
    const jet = JETS.find((j) => j.id === this.save.selectedJet);
    return this.frame(`
      <div class="col">
        <button class="btn primary" data-act="nav" data-to="campaign">CAMPAIGN <small>${Math.min(this.save.stageUnlocked + 1, STAGES.length)}/${STAGES.length} stages</small></button>
        <button class="btn" data-act="nav" data-to="skirmish">SKIRMISH <small>custom dogfight</small></button>
        <button class="btn" data-act="nav" data-to="hangar">HANGAR <small>${JETS.filter((j) => this.save.ownedJets.includes(j.id)).length}/${JETS.length} jets</small></button>
        <button class="btn" data-act="nav" data-to="settings">SETTINGS</button>
        <button class="btn" data-act="nav" data-to="controls">CONTROLS</button>
      </div>
      <div class="jetcard"><div class="k">SELECTED AIRCRAFT</div><div class="n">${jet.name}</div><div class="r">${jet.role}</div></div>
      <div class="foot">Click anywhere to enable sound • Gamepad supported • Created by <a href="https://balavenkatesh.is-a.dev/" target="_blank" rel="noopener" style="color:#22d3ee">Bala Venkatesh</a></div>`);
  }

  render_loading() {
    return `<div class="loading"><div class="spin"></div><div>PREPARING THEATER…</div><small>Generating terrain, ocean and air wing</small></div>`;
  }

  render_campaign() {
    const cards = STAGES.map((s, i) => {
      const locked = i > this.save.stageUnlocked;
      const th = THEATERS[s.theater];
      const st = this.save.stars[s.id] || 0;
      return `<div class="stage ${locked ? 'locked' : ''} th-${s.theater}" ${locked ? '' : `data-act="brief" data-i="${i}"`}>
        <div class="num">STAGE ${s.id}</div>
        <div class="title">${s.name}</div>
        <div class="meta">${th.name} • ${th.base === 'carrier' ? 'Carrier ops' : 'Airbase ops'}</div>
        <div class="stars">${locked ? '🔒 LOCKED' : stars(st)}</div>
        <div class="reward">+${s.reward.toLocaleString()} CR${JETS.some((j) => j.unlockStage === i + 1) ? ` • unlocks ${JETS.find((j) => j.unlockStage === i + 1).name}` : ''}</div>
      </div>`;
    }).join('');
    return this.frame(`<div class="panel wide"><h2>CAMPAIGN — OPERATION SKYFORGE</h2><div class="stages">${cards}</div>
      <div class="row"><button class="btn small" data-act="nav" data-to="main">◀ BACK</button></div></div>`);
  }

  render_brief(i) {
    const s = STAGES[i];
    this.briefIdx = i;
    const th = THEATERS[s.theater];
    const jet = JETS.find((j) => j.id === this.save.selectedJet);
    return this.frame(`<div class="panel wide brief">
      <h2>STAGE ${s.id}: ${s.name.toUpperCase()}</h2>
      <div class="grid2">
        <div>
          <div class="k">THEATER</div><p>${th.name} — ${th.base === 'carrier' ? 'launch from CVN-77 Resolute (catapult)' : 'takeoff from Firebase ' + 'Kestrel runway 36'}</p>
          <div class="k">SITUATION</div><p>${s.briefing}</p>
          <div class="k">OBJECTIVES</div><ul>${s.objectives.map((o) => `<li>${o}</li>`).join('')}${s.requireLanding ? '' : '<li class="dim">Bonus: return and land safely</li>'}</ul>
          <div class="k">FORCES</div><p>${s.wingmen} wingm${s.wingmen === 1 ? 'an' : 'en'} • Enemy: ${[...new Set(s.waves.map((w) => ENEMY_JETS[w.type].name))].join(', ')}</p>
        </div>
        <div>
          <div class="k">YOUR AIRCRAFT</div><div class="n big">${jet.name}</div><div class="dim">${jet.role}</div>
          ${statBars(jet)}
          <p class="dim">Loadout: ${jet.ir}× IR • ${jet.radar}× radar • ${jet.agm}× AGM • ${jet.flares} flares</p>
          <button class="btn small" data-act="hangarFrom" data-from="brief">CHANGE AIRCRAFT</button>
        </div>
      </div>
      <div class="row"><button class="btn small" data-act="nav" data-to="campaign">◀ BACK</button>
      <button class="btn primary" data-act="launch">LAUNCH ▶</button></div></div>`);
  }

  render_hangar() {
    const sel = this.hangarSel || this.save.selectedJet;
    const j = JETS.find((x) => x.id === sel);
    const owned = this.save.ownedJets.includes(j.id);
    const stageOk = this.save.stageUnlocked >= j.unlockStage;
    const canBuy = !owned && stageOk && this.save.credits >= j.cost;
    const list = JETS.map((x) => {
      const o = this.save.ownedJets.includes(x.id);
      const avail = this.save.stageUnlocked >= x.unlockStage;
      return `<div class="jet ${x.id === sel ? 'sel' : ''} ${o ? 'owned' : avail ? 'avail' : 'locked'}" data-act="pickJet" data-id="${x.id}">
        <b>${x.name}</b><small>${o ? (x.id === this.save.selectedJet ? 'EQUIPPED' : 'OWNED') : avail ? x.cost.toLocaleString() + ' CR' : '🔒 Clear stage ' + x.unlockStage}</small></div>`;
    }).join('');
    const liv = LIVERIES.map((l) => `<div class="swatch ${l.id === this.save.livery ? 'sel' : ''}" title="${l.name}" data-act="livery" data-id="${l.id}" style="background:linear-gradient(135deg,#${l.base.toString(16).padStart(6, '0')} 50%,#${l.alt.toString(16).padStart(6, '0')} 50%);border-color:#${l.accent.toString(16).padStart(6, '0')}"></div>`).join('');
    let action = '';
    if (owned) action = j.id === this.save.selectedJet ? '<button class="btn" disabled>EQUIPPED</button>' : `<button class="btn primary" data-act="equip" data-id="${j.id}">EQUIP</button>`;
    else if (!stageOk) action = `<button class="btn" disabled>🔒 Complete stage ${j.unlockStage} to unlock</button>`;
    else action = `<button class="btn ${canBuy ? 'primary' : ''}" ${canBuy ? '' : 'disabled'} data-act="buy" data-id="${j.id}">BUY — ${j.cost.toLocaleString()} CR</button>`;
    this.after = () => this.game.setShowroomJet(sel, this.save.livery);
    return this.frame(`<div class="panel hangar">
      <h2>HANGAR</h2>
      <div class="jets">${list}</div>
      <div class="detail">
        <div class="n big">${j.name}</div><div class="dim">${j.role}</div>
        <p>${j.desc}</p>
        ${statBars(j)}
        <p class="dim">${j.ir}× IR • ${j.radar}× radar • ${j.agm}× AGM • ${j.gun} rds • ${j.flares} flares • max ${j.maxG} G</p>
        ${action}
        <div class="k" style="margin-top:14px">LIVERY</div><div class="swatches">${liv}</div>
        <div class="k">CALLSIGN</div>
        <input id="callsign" maxlength="10" value="${esc(this.save.callsign)}" />
      </div>
      <div class="row"><button class="btn small" data-act="hangarBack">◀ BACK</button></div></div>`);
  }

  render_skirmish() {
    const sk = this.skirmish;
    const unlockedTheaters = new Set(STAGES.filter((s, i) => i <= this.save.stageUnlocked).map((s) => s.theater));
    const ths = SKIRMISH_THEATERS.map((t) => {
      const ok = unlockedTheaters.has(t);
      return `<div class="opt ${sk.theater === t ? 'sel' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-act="sk" data-k="theater" data-v="${t}"` : ''}>${THEATERS[t].name}${ok ? '' : ' 🔒'}</div>`;
    }).join('');
    const opt = (k, vals, labels) => vals.map((v, i) => `<div class="opt ${sk[k] === v ? 'sel' : ''}" data-act="sk" data-k="${k}" data-v="${v}">${labels ? labels[i] : v}</div>`).join('');
    return this.frame(`<div class="panel wide">
      <h2>SKIRMISH</h2>
      <div class="k">THEATER</div><div class="opts">${ths}</div>
      <div class="k">ENEMY FIGHTERS</div><div class="opts">${opt('enemies', [2, 4, 6, 8, 12])}</div>
      <div class="k">ENEMY TIER</div><div class="opts">${opt('tier', [0, 1, 2, 3, 4], ENEMY_JETS.map((e) => e.name))}</div>
      <div class="k">WINGMEN</div><div class="opts">${opt('wingmen', [0, 1, 2, 3])}</div>
      <div class="k">GROUND / NAVAL TARGETS</div><div class="opts">${opt('ground', [true, false], ['Yes', 'No'])}</div>
      <div class="row"><button class="btn small" data-act="nav" data-to="main">◀ BACK</button><button class="btn primary" data-act="launchSk">LAUNCH ▶</button></div></div>`);
  }

  render_settings() {
    const s = this.save.settings;
    const opt = (k, vals, labels) => vals.map((v, i) => `<div class="opt ${s[k] === v ? 'sel' : ''}" data-act="set" data-k="${k}" data-v="${v}">${labels ? labels[i] : v}</div>`).join('');
    const slider = (k, label) => `<div class="k">${label}</div><input type="range" min="0" max="1" step="0.05" value="${s[k]}" data-slider="${k}" />`;
    this.after = () => {
      this.root.querySelectorAll('[data-slider]').forEach((el) => el.addEventListener('input', () => {
        s[el.dataset.slider] = parseFloat(el.value);
        this.game.audio.setVolumes({ sfx: s.sfx, music: s.music, voice: s.voice });
        this.game.persist();
      }));
    };
    return this.frame(`<div class="panel">
      <h2>SETTINGS</h2>
      <div class="k">GRAPHICS QUALITY</div><div class="opts">${opt('quality', ['low', 'medium', 'high'], ['Low', 'Medium', 'High (reflections + shadows)'])}</div>
      <div class="k">DIFFICULTY</div><div class="opts">${opt('difficulty', ['easy', 'normal', 'hard'], ['Recruit', 'Veteran', 'Ace'])}</div>
      <div class="k">PITCH CONTROL</div><div class="opts">${opt('invertPitch', [false, true], ['Flight sim (S = pull up)', 'Inverted (W = pull up)'])}</div>
      <div class="k">FPS COUNTER</div><div class="opts">${opt('showFps', [true, false], ['Show', 'Hide'])}</div>
      ${slider('music', 'MUSIC VOLUME')}${slider('sfx', 'EFFECTS VOLUME')}${slider('voice', 'RADIO / VOICE VOLUME')}
      <div class="row"><button class="btn small" data-act="nav" data-to="main">◀ BACK</button><button class="btn small danger" data-act="reset">RESET PROGRESS</button></div></div>`);
  }

  render_controls() {
    const rows = [
      ['W / S  or  ↑ / ↓', 'Pitch down / pull up', 'Left stick Y'], ['A / D  or  ← / →', 'Roll left / right', 'Left stick X'],
      ['Q / E', 'Rudder (yaw)', 'Right stick X'], ['Shift / Ctrl', 'Throttle up / down (above 100% = afterburner)', 'RT / LT'],
      ['Space', 'Cannon', 'A'], ['F', 'Fire selected missile', 'B'], ['1 / 2 / 3 / 4  or  R', 'IR missile / Radar missile / AGM / Gun', 'D-pad'],
      ['T', 'Cycle target', 'Y'], ['X', 'Flares / countermeasures', 'X'], ['G', 'Landing gear (+ tail hook on carrier)', 'D-pad up'],
      ['B', 'Speed brake (air) / wheel brakes (ground)', 'D-pad down'], ['L', 'Auto-land (ILS approach to base)', 'L3'],
      ['Tab', 'Wingmen orders: engage / cover / attack my target', '—'], ['C', 'Camera: chase / cockpit / far / target lock / cinematic', 'Back'],
      ['V (hold)', 'Look back', 'R3'], ['H', 'Toggle key help', '—'], ['Esc / P', 'Pause', 'Start'], ['Enter', 'End mission after objectives (when landing optional)', '—'],
    ];
    return this.frame(`<div class="panel wide">
      <h2>CONTROLS</h2>
      <table class="ctl"><tr><th>Keyboard</th><th>Action</th><th>Gamepad</th></tr>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="dim">${r[2]}</td></tr>`).join('')}</table>
      <div class="tips"><b>TAKEOFF:</b> Carrier — hold Shift to MIL power, catapult fires automatically. Runway — full throttle, pull back (S) at ~140 kts.
      <br><b>LANDING:</b> Gear down (G), slow to the ILS target speed, follow the ILS needles / LSO calls. Press L for auto-land. On the carrier, touch down near the stern to catch a wire.
      <br><b>COMBAT:</b> Get the target inside the seeker circle, wait for the solid LOCK tone, then fire. Drop flares when you hear the fast missile warning.</div>
      <div class="row"><button class="btn small" data-act="back">◀ BACK</button></div></div>`);
  }

  render_pause() {
    return `<div class="menu pause"><div class="panel">
      <h2>PAUSED</h2>
      <button class="btn primary" data-act="resume">RESUME</button>
      <button class="btn" data-act="restart">RESTART MISSION</button>
      <button class="btn" data-act="pauseControls">CONTROLS</button>
      <button class="btn danger" data-act="quit">QUIT TO MENU</button></div></div>`;
  }

  showDebrief(r) {
    this.lastResult = r;
    this.show('debrief', r);
  }

  render_debrief(r) {
    const s = r.cfg.stage;
    const idx = s ? STAGES.indexOf(s) : -1;
    const hasNext = s && idx + 1 < STAGES.length && this.save.stageUnlocked > idx;
    if (r.success) setTimeout(() => this.game.audio.play('unlock'), 300);
    return this.frame(`<div class="panel debrief ${r.success ? 'ok' : 'fail'}">
      <h2>${r.success ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED'}</h2>
      ${s ? `<div class="dim">Stage ${s.id}: ${s.name}</div>` : '<div class="dim">Skirmish</div>'}
      ${r.success ? `<div class="bigstars">${stars(r.stars || 1)}</div>` : `<p>${esc(r.reason || '')}</p>`}
      <table class="ctl">
        <tr><td>Air kills</td><td>${r.kills}</td></tr>
        <tr><td>Ground / naval kills</td><td>${r.groundKills}</td></tr>
        ${r.success ? `<tr><td>Landed</td><td>${r.landed ? 'Yes — landing bonus' : 'No'}</td></tr>` : ''}
        <tr><td>Score</td><td>${r.score}</td></tr>
        <tr><td><b>Credits earned</b></td><td><b>+${r.credits.toLocaleString()} CR</b></td></tr>
      </table>
      ${r.unlocked?.length ? `<div class="unlock">NEW AIRCRAFT AVAILABLE IN HANGAR: <b>${r.unlocked.join(', ')}</b></div>` : ''}
      <div class="row">
        <button class="btn small" data-act="nav" data-to="main">MAIN MENU</button>
        <button class="btn" data-act="retry">${r.success ? 'REPLAY' : 'RETRY'}</button>
        ${hasNext ? `<button class="btn primary" data-act="brief" data-i="${idx + 1}">NEXT STAGE ▶</button>` : ''}
        ${!s ? '' : '<button class="btn small" data-act="nav" data-to="hangar">HANGAR</button>'}
      </div></div>`);
  }

  // ---------------------------------------------------------------- actions
  act(a, d) {
    const g = this.game, save = this.save;
    switch (a) {
      case 'nav': this.returnTo = 'main'; this.hangarSel = null; this.show(d.to); if (d.to === 'main') g.setShowroomJet(save.selectedJet, save.livery); break;
      case 'back': this.show(this.returnTo || 'main'); break;
      case 'brief': this.show('brief', +d.i); break;
      case 'hangarFrom': this.hangarReturn = d.from; this.show('hangar'); break;
      case 'hangarBack': this.saveCallsign(); this.hangarSel = null; g.setShowroomJet(save.selectedJet, save.livery); this.show(this.hangarReturn === 'brief' ? 'brief' : 'main', this.briefIdx); this.hangarReturn = null; break;
      case 'pickJet': this.saveCallsign(); this.hangarSel = d.id; this.show('hangar'); break;
      case 'equip': save.selectedJet = d.id; g.persist(); g.audio.play('select'); this.show('hangar'); break;
      case 'buy': {
        const j = JETS.find((x) => x.id === d.id);
        if (save.credits >= j.cost && !save.ownedJets.includes(j.id)) {
          save.credits -= j.cost; save.ownedJets.push(j.id); save.selectedJet = j.id; g.persist(); g.audio.play('unlock');
        }
        this.show('hangar'); break;
      }
      case 'livery': this.saveCallsign(); save.livery = d.id; g.persist(); this.show('hangar'); break;
      case 'launch': g.startMission({ stage: STAGES[this.briefIdx], theater: STAGES[this.briefIdx].theater }); break;
      case 'sk': {
        const v = d.v === 'true' ? true : d.v === 'false' ? false : isNaN(+d.v) ? d.v : +d.v;
        this.skirmish[d.k] = v; this.show('skirmish'); break;
      }
      case 'launchSk': {
        const sk = this.skirmish;
        const n = sk.enemies;
        const waves = [{ count: Math.ceil(n / 2), type: sk.tier, dist: 10000, alt: 3000, delay: 0 }];
        if (n > 1) waves.push({ count: Math.floor(n / 2), type: Math.min(4, sk.tier + 1), dist: 13000, alt: 4000, delay: 60 });
        const naval = THEATERS[sk.theater].base === 'carrier' && sk.theater !== 'coast';
        const groundTargets = sk.ground ? (naval ? [{ type: 'frigate', count: 2, zone: { dist: 11000, angle: 0, radius: 2000 } }] : [{ type: 'sam', count: 3, zone: { dist: 10000, angle: 0, radius: 2500 } }, { type: 'aaa', count: 3, zone: { dist: 10000, angle: 0, radius: 2000 } }]) : [];
        g.startMission({ theater: sk.theater, waves, wingmen: sk.wingmen, groundTargets });
        break;
      }
      case 'set': {
        const v = d.v === 'true' ? true : d.v === 'false' ? false : d.v;
        save.settings[d.k] = v;
        if (d.k === 'quality') g.applyQuality();
        if (d.k === 'invertPitch') g.input.invertPitch = v;
        g.persist(); this.show('settings'); break;
      }
      case 'reset':
        if (confirm('Reset all progress, credits and unlocked jets?')) { g.save = resetSave(); g.setShowroomJet('f16', 'grey'); this.show('settings'); }
        break;
      case 'resume': g.togglePause(); break;
      case 'restart': { const cfg = g.mission.cfg; g.state = 'menu'; g.startMission(cfg); break; }
      case 'pauseControls': this.returnTo = 'pause'; this.show('controls'); break;
      case 'quit': g.quitToMenu(); break;
      case 'retry': g.startMission(this.lastResult.cfg); break;
      default: break;
    }
  }

  saveCallsign() {
    const el = this.root.querySelector('#callsign');
    if (el) {
      const v = el.value.trim().toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 10);
      if (v) { this.save.callsign = v; this.game.persist(); }
    }
  }
}
