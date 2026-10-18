const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'autopilot-config.json');
const HISTORY_PATH = path.join(__dirname, '..', 'history.json');

const DEFAULT_CONFIG = {
  enabled: false,
  schedule: '0 */12 * * *',
  scheduleLabel: 'every-12h',
  privacy: 'private',
  autoTrending: true,
  nicheFocus: 'smart_mix', // 'smart_mix', 'gaming', 'awaited_launches', 'trending_now'
  geminiModel: 'gemini-3.8-flash', // Google Flagship model (fast, quota-friendly, resilient)
  sources: [
    { type: 'keyword', url: 'GTA 6 gameplay graphics shorts', name: 'GTA 6 & Awaited Launches' },
    { type: 'keyword', url: 'insane viral gaming clips shorts', name: 'Gaming Highlights' },
    { type: 'keyword', url: 'most anticipated upcoming games shorts', name: 'Upcoming Game Launches' },
    { type: 'keyword', url: 'futuristic technology gadgets innovations shorts', name: 'Trending Tech Innovations' }
  ],
  maxCandidates: 10
};

function normalizeModel(m) {
  if (!m) return 'gemini-3.8-flash';
  const clean = m.trim();
  if (clean === 'gemini-2.5-pro' || clean === 'gemini-1.5-pro') return 'gemini-3.1-pro-preview';
  if (clean === 'gemini-2.5-flash' || clean === 'gemini-2.0-flash' || clean === 'gemini-1.5-flash') return 'gemini-3.8-flash';
  return clean;
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
    return parsed;
  } catch (err) {
    console.error('Failed to read config, returning default:', err.message);
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
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
