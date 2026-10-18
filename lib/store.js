const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'autopilot-config.json');
const HISTORY_PATH = path.join(__dirname, '..', 'history.json');

const DEFAULT_CONFIG = {
  enabled: false,
  schedule: '0 */12 * * *',
  scheduleLabel: 'every-12h',
  privacy: 'private',
  sources: [
    { type: 'channel', url: 'https://www.youtube.com/@TED/shorts', name: 'TED Shorts' },
    { type: 'keyword', url: 'artificial intelligence shorts', name: 'AI Innovations' }
  ],
  maxCandidates: 8
};

function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
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
