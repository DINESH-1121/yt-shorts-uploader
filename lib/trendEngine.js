const aiClient = require('./aiClient');
const fs = require('fs');
const path = require('path');

const TREND_CACHE_PATH = path.join(__dirname, '..', 'trend-queries.json');
// Trend queries barely change hour to hour, and generating them costs a full
// model session (~40s), so cache them for a few cycles instead of every run.
const TREND_CACHE_TTL_MS = Math.max(0, Number(process.env.TREND_CACHE_HOURS ?? 6)) * 60 * 60 * 1000;

/**
 * Returns cached trend queries while they are still fresh, otherwise null.
 */
function readTrendCache() {
  if (TREND_CACHE_TTL_MS === 0) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(TREND_CACHE_PATH, 'utf-8'));
    if (!Array.isArray(cached?.queries) || cached.queries.length === 0) return null;
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (!Number.isFinite(age) || age > TREND_CACHE_TTL_MS) return null;
    return { queries: cached.queries, generatedAt: cached.generatedAt };
  } catch {
    return null;
  }
}

function writeTrendCache(queries) {
  try {
    fs.writeFileSync(TREND_CACHE_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      queries
    }, null, 2));
  } catch (err) {
    console.warn('[TrendEngine] Could not write trend cache:', err.message);
  }
}

function clearTrendCache() {
  try {
    if (fs.existsSync(TREND_CACHE_PATH)) {
      fs.unlinkSync(TREND_CACHE_PATH);
      console.log('[TrendEngine] 🗑️ Cleared trend queries cache.');
    }
  } catch (err) {
    console.warn('[TrendEngine] Could not clear trend cache:', err.message);
  }
}

// Preset high-velocity trending pools with heavy Worldwide Gaming focus + Tech Innovations
const TREND_POOLS = {
  gaming: [
    'worldwide trending gaming clips shorts',
    'most viral gaming moments in the world shorts',
    'GTA 6 worldwide viral trailer gameplay shorts',
    'GTA 6 vs GTA 5 graphics comparison shorts',
    'minecraft world record viral moments shorts',
    'fortnite worldwide viral clutch shorts',
    'valorant insane global esports clutch shorts',
    'black myth wukong epic boss fight viral shorts',
    'unreal engine 5 photorealistic graphics shorts',
    'elden ring most insane moments viral shorts',
    'best viral gaming clips worldwide shorts',
    'cyberpunk 2077 ultra realistic graphics shorts',
    'upcoming PS5 Pro next gen game releases shorts',
    'most anticipated upcoming games 2026 worldwide shorts'
  ],
  tech_innovations: [
    'futuristic tech gadgets and innovations shorts',
    'breakthrough AI technology demo viral shorts',
    'next gen robotic inventions shorts',
    'insane tech inventions you must see shorts',
    'next gen tech and AI hardware launches shorts'
  ],
  trending_now: [
    'worldwide trending viral gaming shorts',
    'viral gaming moments this week shorts',
    'breaking worldwide gaming news launch teasers shorts',
    'viral tech innovations reactions shorts'
  ]
};

/**
 * Generates dynamic high-hype search queries for worldwide gaming (primary) and tech innovations (secondary)
 * @param {object} opts
 * @param {string} [opts.model] Preferred model ref ("provider/model"); the free-model chain handles fallback
 * @param {number} [opts.count]
 * @param {boolean} [opts.forceRefresh] Bypass the on-disk query cache
 */
async function getDynamicSearchQueries({ model = 'opencode/glm-5.3-flash-free', count = 5, forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readTrendCache();
    if (cached) {
      console.log(`[TrendEngine] ♻️ Using cached trend queries from ${cached.generatedAt}`);
      return cached.queries.slice(0, count);
    }
  }

  const preferredModel = aiClient.normalizeModelName(model);
  try {
    const prompt = `You are an elite YouTube Shorts viral trends strategist targeting a massive international audience.
Generate ${count} short, high-CTR YouTube search queries to discover the freshest, most viral YouTube Shorts right now.

CORE CONTENT STRATEGY:
- PRIMARY FOCUS (~70%): WORLDWIDE HIGHLY TRENDING GAMING CONTENT.
  Strictly target globally dominant games and international gaming phenomena with massive worldwide appeal:
  * GTA 6 (Grand Theft Auto VI) leaks, gameplay, graphics comparisons
  * Minecraft viral world records, epic builds, and hacks
  * Fortnite, Valorant, Call of Duty, Counter-Strike 2 insane clutch plays
  * Black Myth: Wukong, Elden Ring, and AAA Unreal Engine 5 photorealistic game graphics
  * Viral world-record gaming moments and global gaming humor
  Ensure the queries target videos that appeal universally across all countries and continents.

- SECONDARY FOCUS (~30%): GLOBALLY TRENDING NEW TECHNOLOGY & INNOVATIONS:
  * Mind-blowing futuristic gadgets, breakthrough AI tech demos, next-gen hardware/consoles.

Requirements:
- Each query must be 3-6 words, optimized for YouTube Shorts algorithm
- Queries must target strictly short-form vertical clips under 60 seconds (append "#shorts" to each query)
- Return ONLY a valid JSON array of strings, e.g. ["gta 6 worldwide viral graphics shorts", "insane gaming moments worldwide shorts", "breakthrough ai tech gadget shorts"]`;

    const { result: queries } = await aiClient.generateJSON(prompt, {
      model: preferredModel,
      task: 'metadata',
      expectArray: true
    });

    console.log(`[TrendEngine] 🧠 AI generated ${queries.length} Gaming-first + Tech queries:`, queries);
    writeTrendCache(queries);
    return queries.slice(0, count);
  } catch (err) {
    console.warn('[TrendEngine] AI dynamic query error, using weighted pool:', err.message);
  }

  // Fallback weighted selection: 70% Gaming, 30% Tech Innovations
  const gamingItems = [...TREND_POOLS.gaming].sort(() => 0.5 - Math.random());
  const techItems = [...TREND_POOLS.tech_innovations].sort(() => 0.5 - Math.random());

  const numTech = Math.max(1, Math.round(count * 0.3));
  const numGaming = count - numTech;

  const selected = [
    ...gamingItems.slice(0, numGaming),
    ...techItems.slice(0, numTech)
  ].sort(() => 0.5 - Math.random());

  console.log(`[TrendEngine] 🎮 Curated ${selected.length} Gaming & Tech queries:`, selected);
  return selected;
}

module.exports = {
  getDynamicSearchQueries,
  clearTrendCache,
  TREND_POOLS,
  readTrendCache,
  TREND_CACHE_PATH
};
