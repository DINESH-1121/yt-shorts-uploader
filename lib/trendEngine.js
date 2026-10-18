const { GoogleGenAI } = require('@google/genai');

// Preset high-velocity trending pools with heavy Gaming focus + Tech Innovations
const TREND_POOLS = {
  gaming: [
    'insane gaming moments shorts',
    'best gaming clips compilation shorts',
    'funny gaming glitches and wins shorts',
    'unreal engine 5 photorealistic graphics shorts',
    'pro gamer clutch moments shorts',
    'minecraft epic builds and secrets shorts',
    'valorant insane ace plays shorts',
    'cyberpunk 2077 ultra realistic graphics shorts',
    'GTA 6 gameplay details trailer leaks shorts',
    'most anticipated upcoming games 2026 shorts',
    'GTA 6 vs GTA 5 graphics comparison shorts',
    'upcoming PS5 Pro next gen game releases shorts'
  ],
  tech_innovations: [
    'futuristic tech gadgets and innovations shorts',
    'breakthrough AI technology demo viral shorts',
    'next gen robotic inventions shorts',
    'insane tech inventions you must see shorts',
    'next gen tech and AI hardware launches shorts'
  ],
  trending_now: [
    'trending viral gaming shorts',
    'viral gaming moments this week shorts',
    'breaking gaming news launch teasers shorts',
    'viral tech innovations reactions shorts'
  ]
};

/**
 * Generates dynamic high-hype search queries for gaming (primary) and tech innovations (secondary)
 */
async function getDynamicSearchQueries({ nicheFocus = 'gaming_tech_mix', apiKey = null, count = 5 }) {
  if (apiKey && apiKey.trim() !== '' && apiKey !== 'your_gemini_api_key_here') {
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      const prompt = `You are a YouTube Shorts viral growth strategist.
Generate ${count} short, high-CTR YouTube search queries to discover the freshest, most viral YouTube Shorts right now.

CORE CONTENT BALANCE:
- PRIMARY FOCUS (~70%): Gaming content (epic gaming moments, viral gameplay clips, GTA 6 leaks/trailers, gaming glitches, pro clutches, most awaited game launches like GTA 6/Witcher 4).
- SECONDARY FOCUS (~30%): Trending Technology & Innovations (futuristic gadgets, breakthrough AI tech, next-gen console/graphics hardware).

Requirements:
- Each query must be 3-6 words, optimized for YouTube Shorts algorithm
- Append "shorts" to each query
- Return ONLY a valid JSON array of strings, e.g. ["gta 6 gameplay leak shorts", "insane gaming clutch moments shorts", "breakthrough ai tech gadget shorts"]`;

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
      } catch (proErr) {
        console.warn('[TrendEngine] gemini-2.5-pro fallback to gemini-2.5-flash for query generation:', proErr.message);
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
      }

      const text = response.text ? response.text.trim() : '';
      const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const queries = JSON.parse(cleanJson);
      if (Array.isArray(queries) && queries.length > 0) {
        console.log(`[TrendEngine] 🧠 Gemini generated ${queries.length} Gaming-first + Tech queries:`, queries);
        return queries.slice(0, count);
      }
    } catch (err) {
      console.warn('[TrendEngine] Gemini dynamic query error, using weighted pool:', err.message);
    }
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
  TREND_POOLS
};
