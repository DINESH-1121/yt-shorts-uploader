const { GoogleGenAI } = require('@google/genai');

/**
 * Evaluates candidate videos and selects the best one using Google Gemini.
 * Generates an optimized, click-worthy title, engaging description, and relevant hashtags.
 *
 * @param {Array} candidates - List of candidate video objects
 * @param {string} apiKey - Gemini API Key
 * @returns {Promise<Object>} Decision object containing winning candidate & new metadata
 */
async function selectAndOptimizeVideo(candidates, apiKey) {
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidate videos available for evaluation');
  }

  // Fallback heuristic if API key is missing
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    console.warn('[AIEngine] GEMINI_API_KEY is not set. Using smart gaming heuristic fallback.');
    // Score candidates: boost gaming keywords, followed by tech keywords
    const scoreCandidate = (c) => {
      let score = (c.viewCount || 0) / 10000;
      const text = `${c.title} ${c.sourceName || ''}`.toLowerCase();
      if (/gta|game|gaming|gameplay|clutch|ps5|xbox|unreal|valorant|minecraft|mod|boss/.test(text)) score += 50;
      if (/tech|ai|gadget|robot|launch|innovation|future/.test(text)) score += 20;
      return score;
    };

    const sorted = [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const winner = sorted[0];

    const cleanTitle = winner.title.replace(/#\S+/g, '').trim();
    const isGaming = /gta|game|gaming|gameplay|clutch|ps5|xbox|unreal|valorant|minecraft/.test(cleanTitle.toLowerCase());
    const mainTag = isGaming ? '#Gaming' : '#Tech';

    return {
      selectedCandidate: winner,
      aiReasoning: 'Selected based on strong gaming engagement and visual hook (Heuristic mode — add GEMINI_API_KEY for deep AI evaluation)',
      optimizedTitle: `${cleanTitle.slice(0, 70)} #Shorts ${mainTag}`,
      optimizedDescription: `${cleanTitle}\n\nOriginal creator: ${winner.uploader}\n\n#shorts ${isGaming ? '#gaming #gameplay #gamers' : '#technology #tech #innovation'} #viral #trending`,
      tags: ['shorts', isGaming ? 'gaming' : 'tech', 'viral', 'trending']
    };
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const prompt = `You are an expert viral content strategist specializing in YouTube Shorts.
Your channel strategy:
- PRIMARY FOCUS (~70%): GAMING ALONE (epic gaming moments, viral gameplay, GTA 6 leaks/trailers, awaited game releases, glitches, pro clutches, Unreal Engine graphics).
- SECONDARY FOCUS (~30%): TRENDING NEW TECHNOLOGY (futuristic gadgets, breakthrough AI innovations, next-gen hardware/consoles).

Your tasks:
1. Review the candidate list below and choose the SINGLE BEST video. Heavily prioritize exciting gaming clips, followed by mind-blowing trending tech.
2. Formulate a high-CTR, irresistible YouTube Short title (max 70 characters, punchy, includes #Shorts and #Gaming or #Tech).
3. Formulate an engaging description (1-2 sentences summarizing the hype + relevant hashtags: #shorts, #gaming, #gameplay, #viral, #trending or #tech).
4. Provide a 1-2 sentence explanation of WHY you picked this video.

Candidate list:
${JSON.stringify(candidates.map((c, i) => ({
  index: i,
  id: c.id,
  title: c.title,
  uploader: c.uploader,
  viewCount: c.viewCount,
  source: c.sourceName
})), null, 2)}

Respond ONLY with a valid JSON object in this format (no markdown backticks, no comments):
{
  "selectedIndex": 0,
  "aiReasoning": "Why this video was selected...",
  "optimizedTitle": "Insane GTA 6 Next-Gen Graphics 🤯 #Shorts #Gaming",
  "optimizedDescription": "Check out this crazy clip!\\n\\n#shorts #gaming #gameplay #viral #trending",
  "tags": ["shorts", "gaming", "gameplay", "viral"]
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text ? response.text.trim() : '';
    const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleanJson);

    const winnerIndex = (typeof result.selectedIndex === 'number' && candidates[result.selectedIndex])
      ? result.selectedIndex
      : 0;

    return {
      selectedCandidate: candidates[winnerIndex],
      aiReasoning: result.aiReasoning || 'Selected by Gemini for high viral and retention potential',
      optimizedTitle: result.optimizedTitle || `${candidates[winnerIndex].title.slice(0, 75)} #Shorts`,
      optimizedDescription: result.optimizedDescription || candidates[winnerIndex].title,
      tags: result.tags || ['shorts', 'viral']
    };
  } catch (err) {
    console.error('[AIEngine] Gemini evaluation failed, falling back to heuristic:', err.message);
    const winner = candidates[0];
    return {
      selectedCandidate: winner,
      aiReasoning: `Gemini API fallback (${err.message}). Selected top available candidate.`,
      optimizedTitle: `${winner.title.slice(0, 75)} #Shorts`,
      optimizedDescription: `${winner.title}\n\n#shorts #viral #trending`,
      tags: ['shorts', 'viral']
    };
  }
}

module.exports = {
  selectAndOptimizeVideo
};
