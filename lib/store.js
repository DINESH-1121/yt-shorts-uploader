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
    if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
      const defaultPct = Math.round(100 / parsed.sources.length);
      parsed.sources.forEach(s => {
        if (typeof s.percentage !== 'number' || s.percentage <= 0) {
          s.percentage = defaultPct;
        }
      });
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

/**
 * Extracts a normalized, canonical video ID from any URL format or ID string
 */
function extractCanonicalId(videoIdOrUrl) {
  if (!videoIdOrUrl || typeof videoIdOrUrl !== 'string') return '';
  const clean = videoIdOrUrl.trim();

  // YouTube Shorts: /shorts/ABC123xyz-_
  const shortsMatch = clean.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // YouTube Watch: v=ABC123xyz-_
  const watchMatch = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/ABC123xyz-_
  const shortUrlMatch = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortUrlMatch) return shortUrlMatch[1];

  // Instagram Reel: /reel/C123xyz/ or /reels/C123xyz/
  const reelMatch = clean.match(/\/reels?\/([a-zA-Z0-9_-]+)/);
  if (reelMatch) return reelMatch[1];

  // Raw 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;

  return clean;
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
  const canonical = extractCanonicalId(entry.id || entry.sourceUrl);

  // Prevent duplicate entries within history itself
  const filtered = history.filter((h) => {
    const hCanon = extractCanonicalId(h.id || h.sourceUrl);
    return !(canonical && hCanon && canonical === hCanon);
  });

  filtered.unshift({
    ...entry,
    canonicalId: canonical || entry.id,
    uploadedAt: new Date().toISOString()
  });

  // Retain up to 5,000 entries so past videos are never forgotten
  const trimmed = filtered.slice(0, 5000);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2));
  return trimmed;
}

function isAlreadyUploaded(videoIdOrUrl) {
  if (!videoIdOrUrl) return false;
  const canonical = extractCanonicalId(videoIdOrUrl);
  const targetStr = String(videoIdOrUrl).trim().toLowerCase();
  const history = getHistory();

  return history.some((h) => {
    // Only 'uploaded' or permanently rejected videos count as processed
    const isProcessed = h.status === 'uploaded' || h.status === 'rejected';
    if (!isProcessed) return false;

    // 1. Canonical ID match
    const hCanon = extractCanonicalId(h.canonicalId || h.id || h.sourceUrl || h.newVideoId);
    if (canonical && hCanon && canonical === hCanon) return true;

    // 2. Direct string / URL match
    const hId = String(h.id || '').trim().toLowerCase();
    const hSrc = String(h.sourceUrl || '').trim().toLowerCase();
    const hNewId = String(h.newVideoId || '').trim().toLowerCase();
    const hNewUrl = String(h.newVideoUrl || '').trim().toLowerCase();

    if (hId && (hId === targetStr || targetStr.includes(hId))) return true;
    if (hSrc && (hSrc === targetStr || targetStr.includes(hSrc) || hSrc.includes(targetStr))) return true;
    if (hNewId && (hNewId === targetStr || targetStr.includes(hNewId))) return true;
    if (hNewUrl && (hNewUrl === targetStr || targetStr.includes(hNewUrl))) return true;

    return false;
  });
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
