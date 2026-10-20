const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'autopilot-config.json');
const HISTORY_PATH = path.join(__dirname, '..', 'history.json');

const { buildCronFromCadence, getScheduleInfo } = require('./cadence');

const DEFAULT_CONFIG = {
  enabled: false,
  schedule: '0 */12 * * *',
  scheduleLabel: 'Every 12 Hours (2x Daily)',
  cadence: {
    mode: 'preset',
    preset: 'every-12h',
    intervalValue: 2,
    intervalUnit: 'hours',
    peakPreset: 'gaming_peak',
    specificTimes: ['12:00', '19:00'],
    customCron: '0 */12 * * *'
  },
  privacy: 'private',
  autoTrending: true,
  nicheFocus: 'smart_mix', // 'smart_mix', 'gaming', 'awaited_launches', 'trending_now'
  geminiModel: 'opencode/glm-5.3-flash-free', // field name kept for config/UI compatibility; value is an OpenCode free-model ref
  sources: [
    { type: 'keyword', url: 'GTA 6 gameplay graphics shorts', name: 'GTA 6 & Awaited Launches' },
    { type: 'keyword', url: 'insane viral gaming clips shorts', name: 'Gaming Highlights' },
    { type: 'keyword', url: 'most anticipated upcoming games shorts', name: 'Upcoming Game Launches' },
    { type: 'keyword', url: 'futuristic technology gadgets innovations shorts', name: 'Trending Tech Innovations' }
  ],
  maxCandidates: 10
};

function normalizeModel(m) {
  if (!m) return 'opencode/glm-5.3-flash-free';
  const clean = m.trim();
  if (clean.includes('-free')) return clean; // already an OpenCode free-model ref
  // Map legacy Gemini-only names to the free tier
  return 'opencode/glm-5.3-flash-free';
}

function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    if (parsed.geminiModel) {
      parsed.geminiModel = normalizeModel(parsed.geminiModel);
    }
    if (!parsed.cadence) {
      parsed.cadence = {
        mode: 'preset',
        preset: 'every-12h',
        intervalValue: 2,
        intervalUnit: 'hours',
        peakPreset: 'gaming_peak',
        specificTimes: ['12:00', '19:00'],
        customCron: parsed.schedule || '0 */12 * * *'
      };
    } else {
      // Keep schedule/scheduleLabel derived from the cadence definition
      const { cron, label } = buildCronFromCadence(parsed.cadence);
      parsed.schedule = cron;
      parsed.scheduleLabel = label;
    }
    return parsed;
  } catch (err) {
    console.error('Failed to read config, returning default:', err.message);
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config) {
  const toSave = { ...config };
  if (toSave.cadence) {
    const { cron, label } = buildCronFromCadence(toSave.cadence);
    toSave.schedule = cron;
    toSave.scheduleLabel = label;
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2));
  return toSave;
}

function getHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function addToHistory(entry) {
  const history = getHistory();
  history.unshift({
    ...entry,
    uploadedAt: new Date().toISOString()
  });
  // Keep last 100 entries
  const trimmed = history.slice(0, 100);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2));
  return trimmed;
}

function isAlreadyUploaded(videoIdOrUrl) {
  const history = getHistory();
  return history.some((h) => 
    h.id === videoIdOrUrl || 
    h.sourceUrl === videoIdOrUrl || 
    (h.sourceUrl && videoIdOrUrl && h.sourceUrl.includes(videoIdOrUrl))
  );
}

module.exports = {
  getConfig,
  saveConfig,
  getHistory,
  addToHistory,
  isAlreadyUploaded,
  CONFIG_PATH,
  HISTORY_PATH
};
