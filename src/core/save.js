const KEY = 'skyforge-strike-save-v2';

const DEFAULT = {
  credits: 0,
  stageUnlocked: 0,           // highest stage index playable
  stars: {},                  // stageId -> best stars
  ownedJets: ['f16'],
  selectedJet: 'f16',
  livery: 'grey',
  callsign: 'VIPER',
  settings: {
    quality: 'high', invertPitch: false, music: 0.55, sfx: 0.8, voice: 0.9,
    difficulty: 'normal', showFps: true, mouseFlight: false,
  },
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    return { ...structuredClone(DEFAULT), ...data, settings: { ...DEFAULT.settings, ...(data.settings || {}) } };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return structuredClone(DEFAULT);
}
