const cron = require('node-cron');
const fs = require('fs');
const { getConfig, saveConfig, addToHistory } = require('./store');
const { scanAllSources } = require('./scanner');
const { selectAndOptimizeVideo, normalizeModelName } = require('./aiEngine');
const { getDynamicSearchQueries } = require('./trendEngine');
const { ensureShortsFormat } = require('./shortsFormatter');

let activeCronTask = null;
let isCycleRunning = false;
const liveLogs = [];

function addLog(msg, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const entry = { timestamp, message: msg, type };
  liveLogs.push(entry);
  if (liveLogs.length > 200) liveLogs.shift();
  console.log(`[AutoPilot ${timestamp}] ${msg}`);
  return entry;
}

function getRecentLogs() {
  return [...liveLogs];
}

/**
 * Executes a single complete Auto-Pilot curation & upload cycle
 */
async function runAutoPilotCycle({ ytDlpPath, downloadFn, uploadFn, oauth2Client, onEvent }) {
  if (isCycleRunning) {
    const msg = 'Auto-Pilot cycle is already in progress. Please wait.';
    addLog(msg, 'warning');
    onEvent?.('warning', { message: msg });
    return { ok: false, message: msg };
  }

  isCycleRunning = true;
  let downloadedFile = null;

  try {
    const notify = (type, message, extra = {}) => {
      addLog(message, type);
      onEvent?.(type, { message, ...extra });
    };

    notify('info', '🚀 Starting AI Auto-Pilot cycle...');

    // 1. Verify YouTube authentication
    if (!oauth2Client?.credentials?.access_token) {
      throw new Error('YouTube is not authenticated. Please click "Connect YouTube" in the UI first.');
    }

    const config = getConfig();
    let effectiveSources = [...(config.sources || [])];

    // 2. Discover Dynamic Trending Gaming & Awaited Launch Topics
    if (config.autoTrending !== false) {
      notify('info', `🔥 TrendEngine: discovering fresh ${config.nicheFocus || 'gaming & awaited launches'} topics...`);
      const dynamicQueries = await getDynamicSearchQueries({
        nicheFocus: config.nicheFocus || 'smart_mix',
        apiKey: config.geminiModel || 'opencode/glm-5.3-flash-free',
        count: 4
      });

      const dynamicSources = dynamicQueries.map(q => ({
        type: 'keyword',
        url: q,
        name: `🎮 Trend: ${q}`
      }));

      // Prepend dynamic trending sources
      effectiveSources = [...dynamicSources, ...effectiveSources];
    }

    if (effectiveSources.length === 0) {
      throw new Error('No sources available. Enable Auto-Trending or add custom channels/keywords.');
    }

    // 3. Scan candidate videos
    notify('info', `🔍 Scanning ${effectiveSources.length} sources for fresh shorts...`);
    const candidates = await scanAllSources(effectiveSources, ytDlpPath, config.maxCandidates || 10);

    if (candidates.length === 0) {
      notify('warning', '⚠️ No new, un-uploaded candidate shorts found in your sources.');
      return { ok: true, message: 'No new candidate videos found' };
    }

    notify('info', `📋 Found ${candidates.length} candidate shorts for evaluation.`);

    // 3. AI Evaluation & Metadata Generation
    const modelToUse = normalizeModelName(config.geminiModel || 'opencode/glm-5.3-flash-free');
    notify('info', `🧠 Asking AI (${modelToUse}) to evaluate candidates & craft viral title...`);
    const aiDecision = await selectAndOptimizeVideo(candidates, null, modelToUse);

    const winner = aiDecision.selectedCandidate;
    notify('info', `🎯 Winner chosen: "${winner.title}" by ${winner.uploader}`);
    notify('info', `💡 AI Reason: ${aiDecision.aiReasoning}`);
    notify('info', `✨ Optimized Title: "${aiDecision.optimizedTitle}"`);

    // 4. Download Video
    notify('progress', `📥 Downloading selected video (${winner.url})...`);
    const { filePath } = await downloadFn(winner.url, (dlMsg) => {
      notify('progress', dlMsg);
    });
    downloadedFile = filePath;

    // 4b. Enforce Strict YouTube Shorts Format (9:16 Vertical, <= 60s)
    notify('progress', '🎨 Verifying video format for YouTube Shorts (9:16 vertical, <= 60s)...');
    const finalShortPath = await ensureShortsFormat(filePath, (fmtMsg) => {
      notify('progress', fmtMsg);
    });
    downloadedFile = finalShortPath;

    // 5. Upload to YouTube
    notify('progress', `📤 Uploading to your YouTube channel (${config.privacy || 'private'})...`);
    const uploadResult = await uploadFn(
      finalShortPath,
      {
        title: aiDecision.optimizedTitle,
        description: aiDecision.optimizedDescription,
        privacy: config.privacy || 'private'
      },
      (upMsg) => {
        notify('progress', upMsg);
      }
    );

    // 6. Record in History
    const historyEntry = {
      id: winner.id,
      sourceUrl: winner.url,
      sourceTitle: winner.title,
      uploader: winner.uploader,
      newVideoId: uploadResult.videoId,
      newVideoUrl: uploadResult.url,
      newTitle: aiDecision.optimizedTitle,
      aiReasoning: aiDecision.aiReasoning,
      privacy: config.privacy || 'private'
    };
    addToHistory(historyEntry);

    notify('done', `🎉 Successfully curated & uploaded! Link: ${uploadResult.url}`, {
      videoUrl: uploadResult.url,
      videoId: uploadResult.videoId,
      title: aiDecision.optimizedTitle,
      aiReasoning: aiDecision.aiReasoning
    });

    return {
      ok: true,
      result: uploadResult,
      decision: aiDecision
    };
  } catch (err) {
    const errorMsg = `❌ Auto-Pilot error: ${err.message}`;
    addLog(errorMsg, 'error');
    onEvent?.('error', { message: errorMsg });
    return { ok: false, error: err.message };
  } finally {
    isCycleRunning = false;
    if (downloadedFile && fs.existsSync(downloadedFile)) {
      try {
        fs.unlinkSync(downloadedFile);
        console.log('[AutoPilot] Cleaned temporary download:', downloadedFile);
      } catch { /* ignore */ }
    }
  }
}

/**
 * Initializes or updates the node-cron scheduled job
 */
function setupScheduler(cronDeps) {
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
    console.log('[AutoPilot] Stopped previous cron task.');
  }

  const config = getConfig();
  if (!config.enabled) {
    console.log('[AutoPilot] Auto-Pilot scheduler is currently DISABLED in config.');
    return;
  }

  const expression = config.schedule || '0 */12 * * *';
  if (!cron.validate(expression)) {
    console.error(`[AutoPilot] Invalid cron expression: "${expression}"`);
    return;
  }

  console.log(`[AutoPilot] ⏰ Scheduler started with schedule: "${expression}" (${config.scheduleLabel || 'custom'})`);
  addLog(`⏰ Scheduler active with schedule: "${expression}"`);

  activeCronTask = cron.schedule(expression, async () => {
    console.log('[AutoPilot] ⏰ Cron trigger fired! Running automated cycle...');
    await runAutoPilotCycle(cronDeps);
  });
}

module.exports = {
  runAutoPilotCycle,
  setupScheduler,
  getRecentLogs,
  addLog,
  isBusy: () => isCycleRunning
};
