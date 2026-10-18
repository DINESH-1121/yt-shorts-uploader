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
    console.warn('[AIEngine] GEMINI_API_KEY is not set. Using smart heuristic fallback.');
    // Pick candidate with highest view count or first one
    const sorted = [...candidates].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    const winner = sorted[0];

    const cleanTitle = winner.title.replace(/#\S+/g, '').trim();
    return {
      selectedCandidate: winner,
      aiReasoning: 'Selected based on highest viewer engagement and freshness (Heuristic mode — add GEMINI_API_KEY for deep AI evaluation)',
      optimizedTitle: `${cleanTitle.slice(0, 75)} #Shorts`,
      optimizedDescription: `${cleanTitle}\n\nOriginal creator: ${winner.uploader}\n\n#shorts #viral #trending #reels`,
      tags: ['shorts', 'trending', 'viral', 'reels']
    };
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const prompt = `You are an expert viral content curator and YouTube Shorts strategist.
I will give you a list of candidate short-form videos gathered from source channels/topics.

Your tasks:
1. Analyze the candidates and select the SINGLE BEST video to republish as a YouTube Short. Favor compelling, engaging, and high-retention topics.
2. Formulate a catchy, high-CTR YouTube Short title (max 80 characters, punchy, engaging, includes #Shorts).
3. Formulate an engaging description (1-3 sentences + 4-6 high-ranking hashtags like #shorts, #viral, #trending).
4. Provide a brief 1-2 sentence explanation of WHY you selected this video.

Candidate list:
${JSON.stringify(candidates.map((c, i) => ({
  index: i,
  id: c.id,
  title: c.title,
  uploader: c.uploader,
  viewCount: c.viewCount,
  source: c.sourceName
})), null, 2)}

Respond ONLY with a valid JSON object in the following format (no markdown backticks, no comments):
{
  "selectedIndex": 0,
  "aiReasoning": "Why this video was selected...",
  "optimizedTitle": "Catchy New Title #Shorts",
  "optimizedDescription": "Engaging description text...\\n\\n#shorts #trending #viral",
  "tags": ["shorts", "viral", "trending"]
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
