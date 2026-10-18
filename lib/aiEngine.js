const { GoogleGenAI } = require('@google/genai');

/**
 * Standard 28-30 viral hashtag generator for fallback / heuristic mode
 */
function getStandardHashtags(title = '', isGaming = true) {
  const baseGamingTags = [
    '#shorts', '#gaming', '#gamers', '#gameplay', '#viral', '#trending',
    '#gta6', '#pcgaming', '#ps5', '#xbox', '#gamerlife', '#videogames',
    '#gamingcommunity', '#fyp', '#foryou', '#clutch', '#funnygaming',
    '#epicmoments', '#twitch', '#youtube', '#gamingshorts', '#nextgen',
    '#unrealengine5', '#playstation', '#xboxseriesx', '#streamer',
    '#gamingclips', '#viralshorts', '#trendingshorts', '#games'
  ];

  const baseTechTags = [
    '#shorts', '#technology', '#tech', '#innovation', '#gadgets', '#future',
    '#ai', '#artificialintelligence', '#robotics', '#engineering', '#viral',
    '#trending', '#futuristic', '#smarttech', '#technews', '#coolgadgets',
    '#inventions', '#science', '#newtech', '#digital', '#fyp', '#foryou',
    '#techtrends', '#techreview', '#viralshorts', '#gadgetlover',
    '#futuretech', '#nextgen', '#trendingshorts', '#smartdevices'
  ];

  return isGaming ? baseGamingTags.join(' ') : baseTechTags.join(' ');
}

/**
 * Evaluates candidate videos and selects the best one using Google Gemini.
 * Generates an optimized, click-worthy title with hashtags and a detailed description with 25-30 hashtags.
 */
async function selectAndOptimizeVideo(candidates, apiKey, modelName = 'gemini-2.5-pro') {
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidate videos available for evaluation');
  }

  // Fallback heuristic if API key is missing
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    console.warn('[AIEngine] GEMINI_API_KEY is not set. Using smart gaming heuristic fallback.');
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
    const mainTags = isGaming ? '#Shorts #Gaming #Viral' : '#Shorts #Tech #Innovation';
    const hashtagsList = getStandardHashtags(cleanTitle, isGaming);

    return {
      selectedCandidate: winner,
      aiReasoning: 'Selected based on strong viral engagement and visual hook (Heuristic mode — add GEMINI_API_KEY for deep AI evaluation)',
      optimizedTitle: `${cleanTitle.slice(0, 65)} ${mainTags}`.trim(),
      optimizedDescription: `${cleanTitle}\n\nExperience one of the craziest clips on the internet right now! Drop a like, share your thoughts in the comments, and don't forget to subscribe for daily viral shorts.\n\nOriginal creator: ${winner.uploader}\n\n${hashtagsList}`,
      tags: ['shorts', isGaming ? 'gaming' : 'tech', 'viral', 'trending']
    };
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const prompt = `You are an elite viral content strategist and YouTube SEO algorithm specialist.
Your channel strategy:
- PRIMARY FOCUS (~70%): GAMING (epic gameplay moments, clutches, glitches, GTA 6 leaks/trailers, awaited launches, Unreal Engine graphics).
- SECONDARY FOCUS (~30%): TRENDING NEW TECHNOLOGY (futuristic tech gadgets, breakthrough AI innovations, next-gen hardware).

Your tasks:
1. Review the candidate list below and pick the SINGLE BEST video with the highest viral potential and retention hook.
2. Formulate a click-worthy, irresistible YouTube Short title (max 75 characters, punchy hook, MUST include 2-3 short hashtags at the end, e.g. #Shorts #Gaming or #GTA6).
3. Formulate a rich, detailed description that includes:
   - An engaging 2-3 sentence story/summary hook explaining what makes this clip awesome.
   - A friendly Call to Action ("Like, comment what you think, and subscribe for more daily shorts!").
   - Credit line for original creator.
   - EXACTLY 25 to 30 relevant, highly-searched hashtags separated by spaces (e.g. #shorts #gaming #gameplay #gta6 #viral #trending #gamers #ps5 #xbox #clutch ... up to 30 hashtags!).
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
  "optimizedDescription": "Check out this incredible moment in gaming history! The graphics and physics in this clip are completely mind-blowing.\\n\\nDrop a like if you enjoyed this and subscribe for daily gaming & tech shorts!\\n\\nCredit: Original Creator\\n\\n#shorts #gaming #gta6 #gameplay #viral #trending #gamers #ps5 #xbox #pcgaming #gamerlife #videogames #twitch #youtube #clip #clutch #fyp #foryou #epicgaming #gamingcommunity #nextgen #technology #innovation #gadgets #unrealengine5 #gamingshorts #viralshorts #trendingshorts #subscribe",
  "tags": ["shorts", "gaming", "gameplay", "viral"]
}`;

  try {
    const selectedModel = modelName || 'gemini-2.5-pro';
    console.log(`[AIEngine] 🧠 Calling Google Pro model: ${selectedModel}`);

    let response;
    try {
      response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
    } catch (primaryErr) {
      if (selectedModel !== 'gemini-2.5-flash') {
        console.warn(`[AIEngine] ${selectedModel} failed (${primaryErr.message}), falling back to gemini-2.5-flash...`);
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
      } else {
        throw primaryErr;
      }
    }

    const responseText = response.text ? response.text.trim() : '';
    const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleanJson);

    const winnerIndex = (typeof result.selectedIndex === 'number' && candidates[result.selectedIndex])
      ? result.selectedIndex
      : 0;

    return {
      selectedCandidate: candidates[winnerIndex],
      aiReasoning: result.aiReasoning || 'Selected by Gemini Pro for maximum gaming & viral appeal',
      optimizedTitle: result.optimizedTitle || `${candidates[winnerIndex].title.slice(0, 65)} #Shorts #Gaming`,
      optimizedDescription: result.optimizedDescription || candidates[winnerIndex].title,
      tags: result.tags || ['shorts', 'gaming', 'viral']
    };
  } catch (err) {
    console.error('[AIEngine] Gemini Pro evaluation failed, falling back to heuristic:', err.message);
    const winner = candidates[0];
    const isGaming = /gta|game|gaming|gameplay|clutch|ps5|xbox|unreal|valorant|minecraft/.test(winner.title.toLowerCase());
    return {
      selectedCandidate: winner,
      aiReasoning: `Gemini Pro fallback (${err.message}). Selected top available candidate.`,
      optimizedTitle: `${winner.title.slice(0, 65)} #Shorts ${isGaming ? '#Gaming' : '#Tech'}`,
      optimizedDescription: `${winner.title}\n\nCheck out this viral clip! Don't forget to like and subscribe for more.\n\n${getStandardHashtags(winner.title, isGaming)}`,
      tags: ['shorts', 'gaming', 'viral']
    };
  }
}

/**
 * Rewrites title and generates detailed description with 25-30 hashtags for a SINGLE video
 * (Used for Manual Uploads as well)
 */
async function rewriteSingleVideoMetadata({ title, description, uploader }, apiKey, modelName = 'gemini-2.5-pro') {
  const isGaming = /gta|game|gaming|gameplay|clutch|ps5|xbox|unreal|valorant|minecraft/.test((title || '').toLowerCase());

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    const cleanTitle = (title || 'Epic Video').replace(/#\S+/g, '').trim();
    const mainTags = isGaming ? '#Shorts #Gaming' : '#Shorts #Viral';
    return {
      optimizedTitle: `${cleanTitle.slice(0, 65)} ${mainTags}`.trim(),
      optimizedDescription: `${cleanTitle}\n\n${description || 'Check out this awesome viral short!'}\n\nLike, comment your thoughts, and subscribe for daily shorts!\n\nOriginal creator: ${uploader || 'Creator'}\n\n${getStandardHashtags(cleanTitle, isGaming)}`,
      tags: ['shorts', isGaming ? 'gaming' : 'viral']
    };
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  const prompt = `You are a YouTube viral SEO strategist.
Given the video details below, formulate:
1. An irresistible, high-CTR YouTube Short title (max 75 characters, punchy, MUST include 2-3 hashtags like #Shorts #Gaming or #GTA6).
2. A detailed, engaging description:
   - A compelling 2-3 sentence overview describing the highlight/excitement of the clip.
   - Friendly Call to Action (like & subscribe).
   - Credit to original creator.
   - EXACTLY 25 to 30 relevant, high-traffic hashtags (e.g. #shorts #gaming #gameplay #viral #trending #gamers ... exactly 25-30 tags!).

Video Info:
Title: ${title}
Description: ${description || 'N/A'}
Creator: ${uploader || 'N/A'}

Respond ONLY with valid JSON:
{
  "optimizedTitle": "Catchy Title #Shorts #Gaming",
  "optimizedDescription": "Detailed engaging description text...\\n\\n#shorts #gaming #gameplay ... (25-30 hashtags)"
}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName || 'gemini-2.5-pro',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const cleanJson = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleanJson);

    return {
      optimizedTitle: result.optimizedTitle || `${title.slice(0, 65)} #Shorts #Gaming`,
      optimizedDescription: result.optimizedDescription || title,
      tags: ['shorts', 'viral']
    };
  } catch (err) {
    console.warn('[AIEngine] rewriteSingleVideoMetadata fallback:', err.message);
    const cleanTitle = (title || 'Epic Video').replace(/#\S+/g, '').trim();
    return {
      optimizedTitle: `${cleanTitle.slice(0, 65)} #Shorts #Gaming`,
      optimizedDescription: `${cleanTitle}\n\nLike and subscribe for more!\n\n${getStandardHashtags(cleanTitle, true)}`,
      tags: ['shorts', 'gaming']
    };
  }
}

module.exports = {
  selectAndOptimizeVideo,
  rewriteSingleVideoMetadata,
  getStandardHashtags
};
