const aiClient = require('./aiClient');

/**
 * Standard 28-30 viral hashtag generator for fallback / heuristic mode
 */
function getStandardHashtags(title = '', isGaming = true) {
  const baseGamingTags = [
    '#shorts', '#gaming', '#gamers', '#gameplay', '#viral', '#trending',
    '#worldwideshorts', '#globalgaming', '#viralgaming', '#gta6', '#pcgaming',
    '#ps5', '#xbox', '#gamerlife', '#videogames', '#gamingcommunity', '#fyp',
    '#foryou', '#clutch', '#funnygaming', '#epicmoments', '#twitch', '#youtube',
    '#gamingshorts', '#nextgen', '#unrealengine5', '#playstation', '#streamer',
    '#gamingclips', '#trendingshorts'
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
 * Normalizes legacy/deprecated model names (old Gemini-only configs) to the
 * OpenCode free-model refs used by this project.
 */
function normalizeModelName(name) {
  return aiClient.normalizeModelName(name);
}

/**
 * Evaluates candidate videos and selects the best one via OpenCode's free models.
 * Generates an optimized, click-worthy title with hashtags and a detailed description with 25-30 hashtags.
 */
async function selectAndOptimizeVideo(candidates, apiKey, modelName = 'opencode/glm-5.3-flash-free') {
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidate videos available for evaluation');
  }

  // Fallback heuristic ready if the AI gateway has no healthy model
  const heuristicMode = () => {
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
      aiReasoning: 'Selected based on strong viral engagement and visual hook (Heuristic mode — no healthy AI model available)',
      optimizedTitle: `${cleanTitle.slice(0, 65)} ${mainTags}`.trim(),
      optimizedDescription: `${cleanTitle}\n\nExperience one of the craziest clips on the internet right now! Drop a like, share your thoughts in the comments, and don't forget to subscribe for daily viral shorts.\n\nOriginal creator: ${winner.uploader}\n\n${hashtagsList}`,
      tags: ['shorts', isGaming ? 'gaming' : 'tech', 'viral', 'trending']
    };
  };

  const prompt = `You are an elite viral content strategist and YouTube SEO algorithm specialist targeting a global international gaming audience.
Your channel strategy:
- STRICT FORMAT REQUIREMENT: Exclusively vertical YouTube Shorts format (videos <= 60 seconds with 9:16 vertical orientation and instant retention hook). Never select long-form video content.
- PRIMARY FOCUS (~70%): WORLDWIDE HIGHLY TRENDING GAMING CONTENT.
  Strictly prioritize globally renowned gaming phenomena with international virality (GTA 6, Minecraft, Fortnite, Valorant, Call of Duty, Black Myth Wukong, viral world record clutches, Unreal Engine 5 graphics). The clip MUST resonate with gamers worldwide, transcending language barriers through high-energy visual action.
- SECONDARY FOCUS (~30%): GLOBALLY TRENDING NEW TECHNOLOGY & INNOVATIONS (breakthrough AI demos, futuristic gadgets, humanoid robotics, next-gen hardware).

Your tasks:
1. Review the candidate list below and pick the SINGLE BEST video with the highest global viral potential and universal audience hook.
2. Formulate a click-worthy, irresistible YouTube Short title (max 75 characters, punchy hook, MUST include 2-3 short hashtags at the end, e.g. #Shorts #Gaming or #GTA6).
3. Formulate a rich, detailed description that includes:
   - An engaging 2-3 sentence story/summary hook explaining what makes this clip awesome.
   - A friendly Call to Action ("Like, comment what you think, and subscribe for more daily shorts!").
   - Credit line for original creator.
   - EXACTLY 25 to 30 relevant, highly-searched hashtags separated by spaces (e.g. #shorts #gaming #worldwideshorts #globalgaming #gameplay #gta6 #viral #trending #gamers ... up to 30 hashtags!).
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
    const { result, usedModel } = await aiClient.generateJSON(prompt, {
      model: modelName,
      task: 'reasoning'
    });

    const winnerIndex = (typeof result.selectedIndex === 'number' && candidates[result.selectedIndex])
      ? result.selectedIndex
      : 0;

    return {
      selectedCandidate: candidates[winnerIndex],
      aiReasoning: result.aiReasoning || `Selected by ${usedModel} for maximum viral appeal`,
      optimizedTitle: result.optimizedTitle || `${candidates[winnerIndex].title.slice(0, 65)} #Shorts #Gaming`,
      optimizedDescription: result.optimizedDescription || candidates[winnerIndex].title,
      tags: Array.isArray(result.tags) ? result.tags : ['shorts', 'gaming', 'viral']
    };
  } catch (err) {
    console.error('[AIEngine] AI evaluation failed on all free models, using heuristic fallback:', err.message);
    const heuristic = heuristicMode();
    return { ...heuristic, aiReasoning: `Heuristic fallback (${err.message.slice(0, 120)}) — ${heuristic.aiReasoning}` };
  }
}

/**
 * Rewrites title and generates detailed description with 25-30 hashtags for a SINGLE video
 * (Used for Manual Uploads as well)
 */
async function rewriteSingleVideoMetadata({ title, description, uploader }, apiKey, modelName = 'opencode/glm-5.3-flash-free') {
  const isGaming = /gta|game|gaming|gameplay|clutch|ps5|xbox|unreal|valorant|minecraft/.test((title || '').toLowerCase());

  const prompt = `You are an elite viral content strategist and YouTube SEO algorithm specialist targeting a global international gaming audience.
Formulate high-performing, click-worthy metadata for this YouTube Short:

Channel content focus:
- Format: Exclusively vertical YouTube Shorts format (under 60 seconds, instant retention hook).
- Worldwide highly trending gaming content (GTA 6, Minecraft, Fortnite, Valorant, Call of Duty, Black Myth Wukong, viral world record clutches, Unreal Engine 5 graphics).
- Globally trending new technology & innovations (breakthrough AI demos, futuristic gadgets, humanoid robotics, next-gen hardware).

Requirements:
1. An irresistible, high-CTR YouTube Short title (max 75 characters, punchy hook, MUST include 2-3 hashtags at the end, e.g. #Shorts #Gaming or #GTA6).
2. A detailed, engaging description:
   - A compelling 2-3 sentence story/summary hook describing the excitement or highlight of the clip.
   - Friendly Call to Action (like, comment thoughts, and subscribe for more daily shorts).
   - Credit to original creator: ${uploader || 'Creator'}.
   - EXACTLY 25 to 30 relevant, highly-searched hashtags separated by spaces (e.g. #shorts #gaming #worldwideshorts #globalgaming #gameplay #gta6 #viral #trending #gamers ... exactly 25-30 hashtags!).

Video Info:
Title: ${title}
Description: ${description || 'N/A'}
Creator: ${uploader || 'N/A'}

Respond ONLY with valid JSON (no markdown backticks, no comments):
{
  "optimizedTitle": "Catchy Title #Shorts #Gaming",
  "optimizedDescription": "Detailed engaging description text...\\n\\n#shorts #gaming #worldwideshorts #globalgaming #gta6 #gameplay #viral #trending #gamers #ps5 #xbox #pcgaming #gamerlife #videogames #twitch #youtube #clip #clutch #fyp #foryou #epicgaming #gamingcommunity #nextgen #technology #innovation #gadgets #unrealengine5 #gamingshorts #viralshorts #trendingshorts"
}`;

  try {
    const { result } = await aiClient.generateJSON(prompt, {
      model: modelName,
      task: 'metadata'
    });

    return {
      optimizedTitle: result.optimizedTitle || `${title.slice(0, 65)} #Shorts #Gaming`,
      optimizedDescription: result.optimizedDescription || title,
      tags: ['shorts', 'viral', 'gaming']
    };
  } catch (err) {
    console.warn('[AIEngine] rewriteSingleVideoMetadata heuristic fallback:', err.message);
    const cleanTitle = (title || 'Epic Video').replace(/#\S+/g, '').trim();
    return {
      optimizedTitle: `${cleanTitle.slice(0, 65)} #Shorts #Gaming`,
      optimizedDescription: `${cleanTitle}\n\n${description || 'Check out this awesome viral short!'}\n\nLike, comment your thoughts, and subscribe for daily shorts!\n\nOriginal creator: ${uploader || 'Creator'}\n\n${getStandardHashtags(cleanTitle, isGaming)}`,
      tags: ['shorts', isGaming ? 'gaming' : 'viral']
    };
  }
}

module.exports = {
  selectAndOptimizeVideo,
  rewriteSingleVideoMetadata,
  getStandardHashtags,
  normalizeModelName
};
