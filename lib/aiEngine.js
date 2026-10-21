const aiClient = require('./aiClient');

/**
 * Niche-specific and universal viral hashtag pools
 */
const HASHTAG_POOLS = {
  minecraft: [
    '#minecraft', '#minecraftmemes', '#minecraftshorts', '#minecraftbuild', '#minecraftpe',
    '#minecraftanimation', '#minecrafter', '#minecraftfunny', '#minecrafthacks', '#minecraftsurvival',
    '#minecraftdaily', '#minecraftlogic', '#minecraftgameplay', '#gaming', '#gamers'
  ],
  gta: [
    '#gta6', '#gta5', '#grandtheftauto', '#gtaviral', '#rockstargames',
    '#gtaclips', '#gtaonline', '#gtamods', '#gaming', '#nextgen',
    '#gtarp', '#gta6trailer', '#gtavideo', '#gtafive', '#gtacommunity'
  ],
  gaming: [
    '#gaming', '#gamers', '#gameplay', '#viralgaming', '#pcgaming',
    '#ps5', '#xbox', '#gamerlife', '#videogames', '#gamingcommunity',
    '#clutch', '#funnygaming', '#epicmoments', '#twitch', '#gamingshorts',
    '#gamingclips', '#nextgen', '#playstation', '#esports', '#gamehighlights'
  ],
  anime: [
    '#anime', '#animedit', '#animeedits', '#animelover', '#otaku',
    '#manga', '#animeart', '#animereels', '#animefight', '#epic',
    '#animes', '#amv', '#amvedits', '#animemoments', '#weeb',
    '#animeaesthetic', '#japan', '#animation', '#edit', '#shonen',
    '#jujutsukaisen', '#demonslayer', '#naruto', '#onepiece', '#dragonball'
  ],
  marvel: [
    '#marvel', '#mcu', '#avengers', '#superhero', '#comics',
    '#marvelstudios', '#cinema', '#epicmoments', '#doomsday', '#marveltok',
    '#marvelcinematicuniverse', '#marveluniverse', '#movietrailer', '#marvellegends', '#action',
    '#geek', '#blockbuster', '#hollywood', '#spiderman', '#avengersdoomsday'
  ],
  movie: [
    '#cinema', '#movie', '#movies', '#cinematography', '#hollywood',
    '#blockbuster', '#movieclips', '#film', '#filmtok', '#movieedits',
    '#trailers', '#cinematic', '#scene', '#actor', '#epic'
  ],
  tech: [
    '#technology', '#tech', '#innovation', '#gadgets', '#future',
    '#ai', '#artificialintelligence', '#robotics', '#engineering', '#smarttech',
    '#technews', '#coolgadgets', '#inventions', '#science', '#newtech',
    '#digital', '#techtrends', '#techreview', '#futuretech', '#smartdevices'
  ],
  universal: [
    '#shorts', '#viral', '#trending', '#fyp', '#foryou',
    '#viralshorts', '#trendingshorts', '#explore', '#reels', '#foryoupage',
    '#shortsvideo', '#viralvideo', '#viralreels', '#trendingnow', '#youtubeshorts'
  ]
};

/**
 * Returns a guaranteed list of 25 to 30 relevant, deduplicated hashtags
 */
function buildRichHashtags(title = '', categoryHint = '', existingTags = []) {
  const text = `${title} ${categoryHint}`.toLowerCase();
  const selectedPool = [];

  // Detect specific niches
  if (/minecraft/i.test(text)) selectedPool.push(...HASHTAG_POOLS.minecraft);
  if (/gta|grand theft auto/i.test(text)) selectedPool.push(...HASHTAG_POOLS.gta);
  if (/anime|naruto|one piece|jujutsu|dragon ball|edit|manga|zenitsu|sukuna|gojo|demonslayer|bleach|luffy|goku/i.test(text)) {
    selectedPool.push(...HASHTAG_POOLS.anime);
  }
  if (/marvel|avengers|mcu|spiderman|superhero|doomsday|ironman|thor/i.test(text)) {
    selectedPool.push(...HASHTAG_POOLS.marvel);
  }
  if (/movie|film|trailer|dune|nolan|oppenheimer|actor|hollywood|cinema/i.test(text)) {
    selectedPool.push(...HASHTAG_POOLS.movie);
  }
  if (/tech|ai|gadget|robot|inventions|innovation|futuristic|apple|tesla/i.test(text)) {
    selectedPool.push(...HASHTAG_POOLS.tech);
  }

  // Always include general gaming if related, plus universal viral tags
  if (/game|gaming|play|clutch|ps5|xbox|unreal|valorant|fortnite|cod/i.test(text) || selectedPool.length === 0) {
    selectedPool.push(...HASHTAG_POOLS.gaming);
  }
  selectedPool.push(...HASHTAG_POOLS.universal);

  // Collect and deduplicate
  const seen = new Set();
  const result = [];

  // First priority: any valid existing hashtags from AI
  for (const t of existingTags) {
    const clean = t.startsWith('#') ? t : `#${t}`;
    const key = clean.toLowerCase();
    if (!seen.has(key) && /^#[a-zA-Z0-9_]+$/.test(clean) && clean.length > 2) {
      seen.add(key);
      result.push(clean);
    }
  }

  // Second priority: category-specific pool
  for (const t of selectedPool) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(t);
    }
    if (result.length >= 30) break;
  }

  // Ensure minimum 25 hashtags
  if (result.length < 25) {
    for (const t of HASHTAG_POOLS.universal) {
      const key = t.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(t);
      }
      if (result.length >= 28) break;
    }
  }

  return result.slice(0, 30);
}

/**
 * Enforces relevant video description + guaranteed minimum 25-30 hashtags
 */
function formatRichDescription({ aiDescription = '', title = '', uploader = '', categoryHint = '', originalDescription = '' }) {
  const rawText = String(aiDescription || '').trim();
  const foundHashtags = (rawText.match(/#[a-zA-Z0-9_]+/g) || []);

  // Strip existing hashtags from narrative text to format cleanly
  let narrative = rawText
    .replace(/#[a-zA-Z0-9_]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // If AI narrative is too brief or missing, build an engaging context-relevant description
  if (!narrative || narrative.length < 25) {
    const cleanTitle = (title || 'Epic Video').replace(/#\S+/g, '').trim();
    if (originalDescription && originalDescription.length > 20) {
      narrative = `${originalDescription.slice(0, 300).trim()}...`;
    } else {
      narrative = `Check out this incredible viral moment from "${cleanTitle}"! Packed with insane highlights, peak visuals, and non-stop action.`;
    }
  }

  // Remove trailing duplicate CTA or credit if AI repeated them
  narrative = narrative
    .replace(/(like,? comment|drop a like|subscribe for daily|credit:?|original creator:?).*$/gim, '')
    .replace(/[\s,;:–-]+$/, '')
    .replace(/\b(and|or|with|the|in|at|to)\s*$/i, '')
    .trim();

  if (narrative && !/[.!?]$/.test(narrative)) {
    narrative += '.';
  }

  // Generate guaranteed 25 to 30 relevant hashtags
  const hashtags = buildRichHashtags(title, categoryHint, foundHashtags);
  const hashtagBlock = hashtags.join(' ');

  const creatorCredit = uploader && uploader !== 'Creator' && uploader !== 'N/A'
    ? `\n\nOriginal creator: @${uploader}`
    : '';

  return `${narrative}\n\nDrop a like if you enjoyed this, share your thoughts in the comments, and don't forget to subscribe for more daily shorts!${creatorCredit}\n\n${hashtagBlock}`;
}

/**
 * Standard 28-30 viral hashtag generator for backwards compatibility
 */
function getStandardHashtags(title = '', categoryHint = '') {
  return buildRichHashtags(title, categoryHint).join(' ');
}

/**
 * Normalizes legacy/deprecated model names to current providers
 */
function normalizeModelName(name) {
  return aiClient.normalizeModelName(name);
}

/**
 * Evaluates candidate videos and selects the best one via AI gateway.
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

    const richDescription = formatRichDescription({
      aiDescription: winner.description || '',
      title: cleanTitle,
      uploader: winner.uploader,
      categoryHint: winner.sourceName || '',
      originalDescription: winner.description || ''
    });

    return {
      selectedCandidate: winner,
      aiReasoning: `Selected candidate from "${winner.sourceName}" to fulfill target content distribution (Heuristic mode)`,
      optimizedTitle: `${cleanTitle.slice(0, 65)} ${mainTags}`.trim(),
      optimizedDescription: richDescription,
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
CRITICAL INSTRUCTIONS:
1. Review the candidate list below. Notice each candidate's "source", "title", and "descriptionSnippet".
2. Select the SINGLE BEST video. YOU MUST RESPECT THE CREATOR'S TARGET CONTENT PERCENTAGES AND STRONGLY PREFER UNDER-REPRESENTED CATEGORIES.
3. Formulate a click-worthy, irresistible YouTube Short title (max 75 characters, punchy hook, MUST include 2-3 short hashtags at the end, e.g. #Shorts #Anime or #Shorts #Gaming or #Shorts #Marvel).
4. Formulate a rich, detailed, and relevant description that includes:
   - An engaging 2-3 sentence story/summary hook explaining what happens in this clip and why it is awesome.
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
  descriptionSnippet: c.description ? c.description.slice(0, 160) : undefined,
  sourceTargetPercentage: c.sourcePercentage ? `${c.sourcePercentage}%` : undefined
})), null, 2)}

Respond ONLY with a valid JSON object in this format (no markdown backticks, no comments):
{
  "selectedIndex": 0,
  "aiReasoning": "Why this video was selected...",
  "optimizedTitle": "Catchy Short Title 🤯 #Shorts #Viral",
  "optimizedDescription": "Check out this incredible moment! The visuals and pacing in this clip are completely unreal.\\n\\nDrop a like if you enjoyed this and subscribe for daily shorts!\\n\\nCredit: @Creator\\n\\n#shorts #viral #trending #reels #explore ... exactly 25 to 30 relevant hashtags!",
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
    const winner = candidates[winnerIndex];

    // Enforce relevant description + guaranteed 25-30 hashtags
    const richDescription = formatRichDescription({
      aiDescription: result.optimizedDescription,
      title: winner.title,
      uploader: winner.uploader,
      categoryHint: winner.sourceName || '',
      originalDescription: winner.description || ''
    });

    return {
      selectedCandidate: winner,
      aiReasoning: result.aiReasoning || `Selected by ${usedModel} for content balance and viral traction`,
      optimizedTitle: result.optimizedTitle || `${winner.title.slice(0, 65)} #Shorts`,
      optimizedDescription: richDescription,
      tags: Array.isArray(result.tags) ? result.tags : ['shorts', 'viral']
    };
  } catch (err) {
    console.error('[AIEngine] AI evaluation failed, using heuristic fallback:', err.message);
    const heuristic = heuristicMode();
    return { ...heuristic, aiReasoning: `Heuristic fallback (${err.message.slice(0, 120)}) — ${heuristic.aiReasoning}` };
  }
}

/**
 * Rewrites title and generates detailed description with 25-30 hashtags for a SINGLE video
 * (Used for Manual Uploads)
 */
async function rewriteSingleVideoMetadata({ title, description, uploader }, apiKey, modelName = 'opencode/glm-5.3-flash-free') {
  const isGaming = /gta|game|gaming|gameplay|clutch|ps5|xbox|unreal|valorant|minecraft/.test((title || '').toLowerCase());

  const prompt = `You are an elite viral content strategist and YouTube SEO algorithm specialist targeting a global international audience.
Formulate high-performing, click-worthy metadata for this YouTube Short:

Requirements:
1. An irresistible, high-CTR YouTube Short title (max 75 characters, punchy hook, MUST include 2-3 hashtags at the end, e.g. #Shorts #Gaming or #GTA6).
2. A detailed, engaging description:
   - A compelling 2-3 sentence story/summary hook describing the excitement or highlight of the clip.
   - Friendly Call to Action (like, comment thoughts, and subscribe for more daily shorts).
   - Credit to original creator: ${uploader || 'Creator'}.
   - EXACTLY 25 to 30 relevant, highly-searched hashtags separated by spaces tailored to the video topic.

Video Info:
Title: ${title}
Description: ${description || 'N/A'}
Creator: ${uploader || 'N/A'}

Respond ONLY with valid JSON (no markdown backticks, no comments):
{
  "optimizedTitle": "Catchy Title #Shorts #Gaming",
  "optimizedDescription": "Detailed engaging description text...\\n\\n#shorts #gaming #viral ... 25 to 30 hashtags"
}`;

  try {
    const { result } = await aiClient.generateJSON(prompt, {
      model: modelName,
      task: 'metadata'
    });

    const richDescription = formatRichDescription({
      aiDescription: result.optimizedDescription,
      title: title,
      uploader: uploader,
      categoryHint: isGaming ? 'Gaming' : 'Trending',
      originalDescription: description || ''
    });

    return {
      optimizedTitle: result.optimizedTitle || `${title.slice(0, 65)} #Shorts #Gaming`,
      optimizedDescription: richDescription,
      tags: ['shorts', 'viral', isGaming ? 'gaming' : 'trending']
    };
  } catch (err) {
    console.warn('[AIEngine] rewriteSingleVideoMetadata heuristic fallback:', err.message);
    const cleanTitle = (title || 'Epic Video').replace(/#\S+/g, '').trim();
    const richDescription = formatRichDescription({
      aiDescription: description || '',
      title: cleanTitle,
      uploader: uploader,
      categoryHint: isGaming ? 'Gaming' : 'Trending',
      originalDescription: description || ''
    });
    return {
      optimizedTitle: `${cleanTitle.slice(0, 65)} #Shorts #Gaming`,
      optimizedDescription: richDescription,
      tags: ['shorts', isGaming ? 'gaming' : 'viral']
    };
  }
}

module.exports = {
  selectAndOptimizeVideo,
  rewriteSingleVideoMetadata,
  getStandardHashtags,
  buildRichHashtags,
  formatRichDescription,
  normalizeModelName
};
