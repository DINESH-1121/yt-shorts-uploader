const { execFile } = require('child_process');
const { isAlreadyUploaded } = require('./store');

/**
 * Normalizes any source URL or keyword query to target strictly vertical Shorts / Reels format
 */
function normalizeSourceTarget(source, maxItems) {
  let target = source.url.trim();

  // If keyword query, format for YouTube Shorts search
  if (source.type === 'keyword' || !target.startsWith('http')) {
    return `ytsearch${maxItems}:${target} #shorts`;
  }

  // If YouTube channel, target the dedicated /shorts tab
  if (target.includes('youtube.com/@') || target.includes('youtube.com/channel/') || target.includes('youtube.com/c/')) {
    if (!target.includes('/shorts')) {
      target = target.replace(/\/videos|\/featured|\/playlists|\/streams|\/about|$/, '') + '/shorts';
    }
  }

  return target;
}

/**
 * Scan a single source using yt-dlp (metadata only, no video download)
 * Strictly filters for short-form video content (duration <= 60 seconds)
 */
function scanSource(source, ytDlpPath, maxItems = 8) {
  return new Promise((resolve) => {
    const target = normalizeSourceTarget(source, maxItems);

    const args = [
      '--no-warnings',
      '--flat-playlist',
      '--dump-json',
      '--playlist-end', String(maxItems),
      '--match-filter', 'duration <= 60 & duration >= 3',
      target
    ];

    execFile(ytDlpPath, args, { timeout: 45000 }, (err, stdout, stderr) => {
      if (err) {
        console.warn(`[Scanner] Warning querying source "${source.name || target}":`, err.message);
        return resolve([]);
      }

      const candidates = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          const videoId = item.id;

          // Reject any video strictly exceeding 60 seconds (Shorts limit)
          if (typeof item.duration === 'number' && (item.duration > 60.5 || item.duration < 3)) {
            continue;
          }

          let videoUrl = item.url || item.webpage_url;
          if (!videoUrl && videoId) {
            videoUrl = `https://www.youtube.com/shorts/${videoId}`;
          }

          if (!videoUrl || !videoId) continue;
          if (isAlreadyUploaded(videoId)) continue;

          candidates.push({
            id: videoId,
            url: videoUrl,
            title: item.title || 'Untitled Short',
            duration: item.duration || null,
            viewCount: item.view_count || null,
            uploader: item.uploader || item.channel || source.name || 'Creator',
            sourceName: source.name || source.url
          });
        } catch {
          // ignore malformed JSON lines
        }
      }

      resolve(candidates);
    });
  });
}

/**
 * Scan all configured sources and gather non-duplicate candidates strictly under 60 seconds.
 * Sources are scanned with a small worker pool (default 3, SCAN_CONCURRENCY to override)
 * so a long source list no longer costs 45s per source sequentially.
 */
async function scanAllSources(sources, ytDlpPath, maxTotal = 10) {
  const concurrency = Math.max(1, Math.min(4, Number(process.env.SCAN_CONCURRENCY) || 3));
  const perSource = new Array(sources.length);
  let nextIndex = 0;
  let collected = 0;

  const worker = async () => {
    while (collected < maxTotal * 2) {
      const index = nextIndex++;
      if (index >= sources.length) return;
      const results = await scanSource(sources[index], ytDlpPath, 6);
      perSource[index] = results;
      collected += results.length;
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, () => worker()));

  const allCandidates = [];
  const seenIds = new Set();
  for (const results of perSource) {
    for (const c of results || []) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        allCandidates.push(c);
      }
    }
  }

  return allCandidates.slice(0, maxTotal);
}

module.exports = {
  scanSource,
  scanAllSources,
  normalizeSourceTarget
};
