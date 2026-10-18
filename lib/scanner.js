const { execFile } = require('child_process');
const { isAlreadyUploaded } = require('./store');

/**
 * Scan a single source using yt-dlp (metadata only, no video download)
 */
function scanSource(source, ytDlpPath, maxItems = 6) {
  return new Promise((resolve) => {
    let target = source.url.trim();

    // If source type is keyword, format as ytsearch
    if (source.type === 'keyword' || !target.startsWith('http')) {
      target = `ytsearch${maxItems}:${target} #shorts`;
    }

    const args = [
      '--no-warnings',
      '--flat-playlist',
      '--dump-json',
      '--playlist-end', String(maxItems),
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
          const videoUrl = item.url || item.webpage_url || (videoId ? `https://www.youtube.com/shorts/${videoId}` : null);

          if (!videoUrl || !videoId) continue;
          if (isAlreadyUploaded(videoId)) continue;

          candidates.push({
            id: videoId,
            url: videoUrl,
            title: item.title || 'Untitled',
            duration: item.duration || null,
            viewCount: item.view_count || null,
            uploader: item.uploader || item.channel || source.name || 'Unknown',
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
 * Scan all configured sources and gather non-duplicate candidates
 */
async function scanAllSources(sources, ytDlpPath, maxTotal = 10) {
  const allCandidates = [];
  const seenIds = new Set();

  for (const src of sources) {
    const results = await scanSource(src, ytDlpPath, 5);
    for (const c of results) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        allCandidates.push(c);
      }
    }
    if (allCandidates.length >= maxTotal * 2) break;
  }

  return allCandidates.slice(0, maxTotal);
}

module.exports = {
  scanSource,
  scanAllSources
};
