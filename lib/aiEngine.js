const aiClient = require('./aiClient');

/**
 * Standard 28-30 viral hashtag generator for fallback / heuristic mode
 */
function getStandardHashtags(title = '', categoryHint = '') {
  const text = `${title} ${categoryHint}`.toLowerCase();
  const isAnime = /anime|naruto|one piece|jujutsu|dragon ball|edit|manga|zenitsu|sukuna|gojo|demonslayer/i.test(text);
  const isMarvel = /marvel|avengers|mcu|spiderman|batman|superhero|movie|doomsday|ironman|thor/i.test(text);
  const isTech = /tech|ai|gadget|robot|inventions|innovation|futuristic/i.test(text);

  if (isAnime) {
    return [
      '#shorts', '#anime', '#animedit', '#animeedits', '#animelover', '#otaku',
      '#manga', '#viral', '#trending', '#fyp', '#foryou', '#animeart',
      '#animereels', '#animefight', '#epic', '#animes', '#amv', '#amvedits',
      '#animemoments', '#viralshorts', '#trendingshorts', '#weeb', '#animeedit',
      '#animeaesthetic', '#japan', '#animation', '#edit', '#shonen'
    ].join(' ');
  }

  if (isMarvel) {
    return [
      '#shorts', '#marvel', '#mcu', '#avengers', '#superhero', '#comics',
      '#marvelstudios', '#viral', '#trending', '#fyp', '#foryou', '#cinema',
      '#epicmoments', '#doomsday', '#marveltok', '#marvelcinematicuniverse',
      '#marveluniverse', '#movietrailer', '#viralshorts', '#trendingshorts',
      '#marvellegends', '#action', '#geek', '#blockbuster', '#hollywood'
    ].join(' ');
  }

  if (isTech) {
    return [
      '#shorts', '#technology', '#tech', '#innovation', '#gadgets', '#future',
      '#ai', '#artificialintelligence', '#robotics', '#engineering', '#viral',
      '#trending', '#futuristic', '#smarttech', '#technews', '#coolgadgets',
      '#inventions', '#science', '#newtech', '#digital', '#fyp', '#foryou',
      '#techtrends', '#techreview', '#viralshorts', '#gadgetlover',
      '#futuretech', '#nextgen', '#trendingshorts', '#smartdevices'
    ].join(' ');
  }

  return [
    '#shorts', '#gaming', '#gamers', '#gameplay', '#viral', '#trending',
    '#worldwideshorts', '#globalgaming', '#viralgaming', '#gta6', '#pcgaming',
    '#ps5', '#xbox', '#gamerlife', '#videogames', '#gamingcommunity', '#fyp',
    '#foryou', '#clutch', '#funnygaming', '#epicmoments', '#twitch', '#youtube',
    '#gamingshorts', '#nextgen', '#unrealengine5', '#playstation', '#streamer',
    '#gamingclips', '#trendingshorts'
  ].join(' ');
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
 * Strictly respects creator content mix percentages and balances under-represented topics.
 */
async function selectAndOptimizeVideo(candidates, apiKey, modelName = 'opencode/glm-5.3-flash-free', options = {}) {
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidate videos available for evaluation');
  }

  const sources = options.sources || [];
  const underrepresented = options.underrepresented || [];

  // Fallback heuristic ready if the AI gateway has no healthy model
  const heuristicMode = () => {
    const scoreCandidate = (c) => {
      let score = Math.min(25, (c.viewCount || 0) / 15000);
      const text = `${c.title} ${c.sourceName || ''}`.toLowerCase();

      // Priority boost given from autopilot deficit balancing
      if (typeof c.priorityBoost === 'number') {
        score += c.priorityBoost;
      }
      if (typeof c.sourcePercentage === 'number' && c.sourcePercentage > 0) {
        score += c.sourcePercentage * 0.5;
      }
      return score;
    };

    const sorted = [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    const winner = sorted[0];

    const cleanTitle = winner.title.replace(/#\S+/g, '').trim();
    const isAnime = /anime|naruto|one piece|jujutsu|dragon ball|edit|manga/i.test(cleanTitle);
    const isMarvel = /marvel|avengers|mcu|spiderman|superhero|movie/i.test(cleanTitle);
    const isTech = /tech|ai|gadget|robot|launch|innovation|future/i.test(cleanTitle);

    let mainTags = '#Shorts #Gaming #Viral';
    if (isAnime) mainTags = '#Shorts #Anime #Viral';
    else if (isMarvel) mainTags = '#Shorts #Marvel #Viral';
    else if (isTech) mainTags = '#Shorts #Tech #Innovation';

    const hashtagsList = getStandardHashtags(cleanTitle, winner.sourceName || '');

    return {
      selectedCandidate: winner,
      aiReasoning: `Selected candidate from "${winner.sourceName}" to fulfill target content distribution (Heuristic mode)`,
      optimizedTitle: `${cleanTitle.slice(0, 65)} ${mainTags}`.trim(),
      optimizedDescription: `${cleanTitle}\n\nExperience one of the craziest clips on the internet right now! Drop a like, share your thoughts in the comments, and don't forget to subscribe for daily viral shorts.\n\nOriginal creator: ${winner.uploader}\n\n${hashtagsList}`,
      tags: ['shorts', 'viral', 'trending']
    };
  };

  let distributionPromptSection = '';
  if (sources.length > 0) {
    const distLines = sources.map(s => `- "${s.name || s.url}": target ${s.percentage || Math.round(100 / sources.length)}% of total uploads`);
    distributionPromptSection += `\nCREATOR'S CONFIGURED CONTENT PERCENTAGES:\n${distLines.join('\n')}\n`;
  }
  if (underrepresented.length > 0) {
    distributionPromptSection += `\n⚠️ URGENT BALANCING NOTICE — The following categories are currently UNDER-REPRESENTED in recent uploads:\n${underrepresented.join('\n')}\nYou SHOULD prioritize selecting a quality candidate from one of these under-represented categories to maintain the creator's configured content percentages.\n`;
  }

  const prompt = `You are an elite viral content strategist and YouTube SEO algorithm specialist.
Your channel operates with a specific multi-topic content strategy defined by the creator:
- STRICT FORMAT REQUIREMENT: Exclusively vertical YouTube Shorts format (videos <= 60 seconds with 9:16 vertical orientation and instant retention hook). Never select long-form video content.
${distributionPromptSection}
CRITICAL INSTRUCTION:
1. Review the candidate list below. Notice each candidate's "source" and "sourcePercentage".
2. Select the SINGLE BEST video. YOU MUST RESPECT THE CREATOR'S TARGET CONTENT PERCENTAGES AND STRONGLY PREFER UNDER-REPRESENTED CATEGORIES. Do NOT pick the same topic or game repeatedly if another configured topic needs uploads to fulfill its percentage!
3. Formulate a click-worthy, irresistible YouTube Short title (max 75 characters, punchy hook, MUST include 2-3 short hashtags at the end, e.g. #Shorts #Anime or #Shorts #Gaming or #Shorts #Marvel).
4. Formulate a rich, detailed description that includes:
   - An engaging 2-3 sentence story/summary hook explaining what makes this clip awesome.
   - Friendly Call to Action ("Like, comment what you think, and subscribe for more daily shorts!").
   - Credit line for original creator.
   - EXACTLY 25 to 30 relevant, highly-searched hashtags separated by spaces tailored specifically to this video's topic.
5. Provide a 1-2 sentence explanation of WHY you picked this video (mentioning viral appeal and target content balancing).

Candidate list:
${JSON.stringify(candidates.map((c, i) => ({
  index: i,
  id: c.id,
  title: c.title,
  uploader: c.uploader,
  viewCount: c.viewCount,
  source: c.sourceName,
  sourceTargetPercentage: c.sourcePercentage ? `${c.sourcePercentage}%` : undefined
})), null, 2)}

Respond ONLY with a valid JSON object in this format (no markdown backticks, no comments):
{
  "selectedIndex": 0,
  "aiReasoning": "Why this video was selected...",
  "optimizedTitle": "Catchy Short Title 🤯 #Shorts #Viral",
  "optimizedDescription": "Check out this incredible moment! The visuals and pacing in this clip are completely unreal.\\n\\nDrop a like if you enjoyed this and subscribe for daily shorts!\\n\\nCredit: Original Creator\\n\\n#shorts #viral #trending #reels #explore ... up to 30 hashtags!",
  "tags": ["shorts", "viral", "trending"]
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
      aiReasoning: result.aiReasoning || `Selected by ${usedModel} for content balance and viral traction`,
      optimizedTitle: result.optimizedTitle || `${candidates[winnerIndex].title.slice(0, 65)} #Shorts`,
      optimizedDescription: result.optimizedDescription || candidates[winnerIndex].title,
      tags: Array.isArray(result.tags) ? result.tags : ['shorts', 'viral']
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
