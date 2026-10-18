const { GoogleGenAI } = require('@google/genai');

// Preset high-velocity trending pools for Gaming & Awaited Launches
const TREND_POOLS = {
  gaming: [
    'insane gaming moments shorts',
    'best gaming clips compilation shorts',
    'funny gaming glitches and wins shorts',
    'unreal engine 5 photorealistic graphics shorts',
    'pro gamer clutch moments shorts',
    'minecraft epic builds and secrets shorts',
    'valorant insane ace plays shorts',
    'cyberpunk 2077 ultra realistic graphics shorts'
  ],
  awaited_launches: [
    'GTA 6 gameplay details trailer leaks shorts',
    'most anticipated upcoming games 2026 shorts',
    'GTA 6 vs GTA 5 graphics comparison shorts',
    'upcoming PS5 Pro next gen game releases shorts',
    'new AAA game announcement trailer shorts',
    'witcher 4 unreal engine 5 reveal shorts',
    'upcoming open world games launch shorts'
  ],
  trending_now: [
    'trending viral gaming shorts',
    'viral gaming moments this week shorts',
    'breaking gaming news launch teasers shorts',
    'viral tech and gaming launch reactions shorts'
  ]
};

/**
 * Generates dynamic high-hype search queries for gaming and awaited launches
 * Uses Gemini if available, or picks from curated viral pools
 */
async function getDynamicSearchQueries({ nicheFocus = 'smart_mix', apiKey = null, count = 4 }) {
  // If Gemini API is available, ask Gemini to generate real-time viral search queries
  if (apiKey && apiKey.trim() !== '' && apiKey !== 'your_gemini_api_key_here') {
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      const prompt = `You are a YouTube viral trends analyst specializing in Gaming and Hyped Launches.
Generate ${count} short, high-CTR YouTube search queries to discover the freshest, most viral YouTube Shorts right now.

Target Niche Focus: "${nicheFocus}"
Include topics like:
- Epic gaming moments, clips, gameplay highlights
- Most awaited game & tech launches (e.g. GTA 6, upcoming AAA games, next-gen engines, console releases)
- Currently trending viral gaming content

Requirements:
- Each query should be 3-6 words, optimized for YouTube search algorithms
- Append "shorts" to each query
- Return ONLY a valid JSON array of strings, e.g. ["query 1 shorts", "query 2 shorts"]`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      const text = response.text ? response.text.trim() : '';
      const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const queries = JSON.parse(cleanJson);
      if (Array.isArray(queries) && queries.length > 0) {
        console.log(`[TrendEngine] 🧠 Gemini generated ${queries.length} dynamic trending queries:`, queries);
        return queries.slice(0, count);
      }
    } catch (err) {
      console.warn('[TrendEngine] Gemini dynamic query generation error, using curated pool:', err.message);
    }
  }

  // Fallback / Rotation logic from curated pools
  let pool = [];
  if (nicheFocus === 'gaming') {
    pool = TREND_POOLS.gaming;
  } else if (nicheFocus === 'awaited_launches') {
    pool = TREND_POOLS.awaited_launches;
  } else if (nicheFocus === 'trending_now') {
    pool = TREND_POOLS.trending_now;
  } else {
    // smart_mix: combine gaming and awaited launches
    pool = [...TREND_POOLS.gaming, ...TREND_POOLS.awaited_launches, ...TREND_POOLS.trending_now];
  }

  // Shuffle and pick `count` items
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, count);
  console.log(`[TrendEngine] 🎮 Curated ${selected.length} search queries for [${nicheFocus}]:`, selected);
  return selected;
}

module.exports = {
  getDynamicSearchQueries,
  TREND_POOLS
};
