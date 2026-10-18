require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Auto-Pilot Modules ──────────────────────────────────────────────────
const { getConfig, saveConfig, getHistory } = require('./lib/store');
const { runAutoPilotCycle, setupScheduler, getRecentLogs, isBusy } = require('./lib/autopilot');

// ── Directories ──────────────────────────────────────────────────────────
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const TOKENS_PATH = path.join(__dirname, 'tokens.json');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);

// ── Resolve yt-dlp binary path ───────────────────────────────────────────
const YT_DLP = (() => {
  const candidates = [
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    'yt-dlp',
  ];
  for (const c of candidates) {
    try {
      require('child_process').execFileSync(c, ['--version'], { timeout: 5000, stdio: 'pipe' });
      console.log(`✅ Found yt-dlp at: ${c}`);
      return c;
    } catch { /* try next */ }
  }
  console.error('❌ yt-dlp not found! Install with: brew install yt-dlp');
  return 'yt-dlp'; // fallback
})();

// ── OAuth2 Client ────────────────────────────────────────────────────────
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

// Load saved tokens on startup
if (fs.existsSync(TOKENS_PATH)) {
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    oauth2Client.setCredentials(tokens);
    console.log('✅ Loaded saved YouTube tokens');
  } catch {
    console.log('⚠️  Could not load saved tokens');
  }
}

// Persist tokens whenever they refresh
oauth2Client.on('tokens', (tokens) => {
  const existing = fs.existsSync(TOKENS_PATH)
    ? JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'))
    : {};
  const merged = { ...existing, ...tokens };
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2));
  console.log('💾 Tokens saved');
});

// ── Middleware ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Routes ──────────────────────────────────────────────────────────

// Check if user is authenticated
app.get('/api/auth/status', (req, res) => {
  const hasTokens = oauth2Client.credentials && oauth2Client.credentials.access_token;
  res.json({ authenticated: !!hasTokens });
});

// Start OAuth flow
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(url);
});

// OAuth callback
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing auth code');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log('✅ YouTube authenticated successfully');
    res.redirect('/');
  } catch (err) {
    console.error('OAuth error:', err.message);
    res.status(500).send('Authentication failed: ' + err.message);
  }
});

// Disconnect (clear tokens)
app.post('/api/auth/disconnect', (req, res) => {
  oauth2Client.revokeCredentials().catch(() => {});
  oauth2Client.credentials = {};
  if (fs.existsSync(TOKENS_PATH)) fs.unlinkSync(TOKENS_PATH);
  res.json({ ok: true });
});

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Validate that a URL is a supported short-form video URL
 */
function validateUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//,
    /^https?:\/\/youtu\.be\//,
    /^https?:\/\/(www\.)?youtube\.com\/watch\?/,
    /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p)\//,
    /^https?:\/\/(www\.)?instagram\.com\/stories\//,
  ];
  return patterns.some((p) => p.test(url));
}

/**
 * Download video using yt-dlp. Returns { filePath, metadata }
 */
function downloadVideo(url, onProgress) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const outputTemplate = path.join(DOWNLOADS_DIR, `${timestamp}_%(id)s.%(ext)s`);

    // First, get metadata
    const metaArgs = [
      '--no-warnings',
      '--print', '%(title)s',
      '--print', '%(id)s',
      '--print', '%(ext)s',
      '--print', '%(description).200s',
      '-f', 'bv*+ba/b',
      '--no-playlist',
      url,
    ];

    onProgress?.('Fetching video info...');

    execFile(YT_DLP, metaArgs, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('yt-dlp meta error:', err.message, stderr);
        return reject(new Error('Failed to fetch video info. Check the URL and try again. Details: ' + (stderr || err.message)));
      }

      const lines = stdout.trim().split('\n');
      const title = lines[0] || 'Untitled';
      const id = lines[1] || 'unknown';
      const ext = lines[2] || 'mp4';
      const description = lines.slice(3).join('\n') || '';

      onProgress?.(`Found: "${title}"`);

      // Now download
      const dlArgs = [
        '--no-warnings',
        '--newline',
        '--no-playlist',
        '-f', 'bv*+ba/b',
        '--merge-output-format', 'mp4',
        '-o', outputTemplate,
        url,
      ];

      onProgress?.('Downloading video...');

      const dl = spawn(YT_DLP, dlArgs);
      let dlStderr = '';

      dl.stdout.on('data', (data) => {
        const line = data.toString().trim();
        const match = line.match(/(\d+\.?\d*)%/);
        if (match) {
          onProgress?.(`Downloading: ${match[1]}%`);
        }
      });

      dl.stderr.on('data', (data) => {
        dlStderr += data.toString();
      });

      dl.on('error', (err) => {
        reject(new Error('Failed to spawn yt-dlp: ' + err.message));
      });

      dl.on('close', (code) => {
        if (code !== 0) {
          console.error('yt-dlp download stderr:', dlStderr);
          return reject(new Error('Download failed: ' + (dlStderr || `exit code ${code}`)));
        }

        // Find the downloaded file
        const possibleFiles = fs.readdirSync(DOWNLOADS_DIR)
          .filter(f => f.startsWith(`${timestamp}_`))
          .map(f => path.join(DOWNLOADS_DIR, f));

        if (possibleFiles.length === 0) {
          // Fallback: look for any file with the video id
          const fallbackFiles = fs.readdirSync(DOWNLOADS_DIR)
            .filter(f => f.includes(id))
            .map(f => path.join(DOWNLOADS_DIR, f));

          if (fallbackFiles.length === 0) {
            return reject(new Error('Downloaded file not found on disk'));
          }
          return resolve({ filePath: fallbackFiles[0], metadata: { title, id, description } });
        }

        resolve({
          filePath: possibleFiles[0],
          metadata: { title, id, description },
        });
      });
    });
  });
}

/**
 * Upload video to YouTube
 */
async function uploadToYouTube(filePath, metadata, onProgress) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const fileSize = fs.statSync(filePath).size;

  onProgress?.('Uploading to YouTube...');

  const res = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: metadata.title.substring(0, 100),
        description: metadata.description || '',
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus: metadata.privacy || 'private',
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(filePath),
    },
  }, {
    onUploadProgress: (evt) => {
      const pct = Math.round((evt.bytesRead / fileSize) * 100);
      onProgress?.(`Uploading to YouTube: ${pct}%`);
    },
  });

  return {
    videoId: res.data.id,
    url: `https://www.youtube.com/watch?v=${res.data.id}`,
    title: res.data.snippet?.title,
  };
}

// ── API Routes ───────────────────────────────────────────────────────────

// SSE endpoint for upload with progress
// IMPORTANT: Always respond with SSE so EventSource on the frontend can read it
app.get('/api/upload', async (req, res) => {
  // Set up SSE headers FIRST — before any validation — so EventSource can read errors
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const sendEvent = (type, data) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    } catch { /* client disconnected */ }
  };

  const url = req.query.url;
  const title = req.query.title;
  const description = req.query.description;
  const privacy = req.query.privacy || 'private';

  // Validate — send errors as SSE events
  if (!url) {
    sendEvent('error', { message: 'Missing URL. Please paste a video URL.' });
    return res.end();
  }
  if (!validateUrl(url)) {
    sendEvent('error', { message: 'Unsupported URL. Please provide a YouTube Shorts or Instagram Reels URL.' });
    return res.end();
  }
  if (!oauth2Client.credentials?.access_token) {
    sendEvent('error', { message: 'Not authenticated. Please connect your YouTube account first.' });
    return res.end();
  }

  let downloadedFile = null;

  try {
    // Step 1: Download
    sendEvent('progress', { message: 'Starting download...' });
    const { filePath, metadata } = await downloadVideo(url, (msg) => {
      sendEvent('progress', { message: msg });
    });
    downloadedFile = filePath;

    // Apply custom title/description if provided
    const uploadMetadata = {
      title: title || metadata.title || 'Uploaded Video',
      description: description || metadata.description || '',
      privacy,
    };

    sendEvent('progress', { message: `Downloaded: "${uploadMetadata.title}"` });

    // Step 2: Upload
    const result = await uploadToYouTube(filePath, uploadMetadata, (msg) => {
      sendEvent('progress', { message: msg });
    });

    sendEvent('done', {
      message: 'Upload complete!',
      videoUrl: result.url,
      videoId: result.videoId,
      title: result.title,
    });
  } catch (err) {
    console.error('Upload pipeline error:', err);
    sendEvent('error', { message: err.message || 'An unexpected error occurred.' });
  } finally {
    // Clean up downloaded file
    if (downloadedFile && fs.existsSync(downloadedFile)) {
      try {
        fs.unlinkSync(downloadedFile);
        console.log('🗑️  Cleaned up:', downloadedFile);
      } catch { /* ignore */ }
    }
    res.end();
  }
});

// ── Auto-Pilot API Routes ────────────────────────────────────────────────

// Get Auto-Pilot configuration & status
app.get('/api/autopilot/config', (req, res) => {
  const config = getConfig();
  res.json({
    config,
    hasGeminiKey: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'),
    isBusy: isBusy()
  });
});

// Update Auto-Pilot configuration
app.post('/api/autopilot/config', (req, res) => {
  try {
    const updated = saveConfig(req.body);
    setupScheduler({
      ytDlpPath: YT_DLP,
      downloadFn: downloadVideo,
      uploadFn: uploadToYouTube,
      oauth2Client
    });
    res.json({ ok: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save Gemini API Key directly to environment and .env file
app.post('/api/autopilot/save-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'API key cannot be empty' });
  }

  process.env.GEMINI_API_KEY = apiKey.trim();

  // Persist to .env
  const envPath = path.join(__dirname, '.env');
  try {
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    if (envContent.includes('GEMINI_API_KEY=')) {
      envContent = envContent.replace(/GEMINI_API_KEY=.*(\r?\n|$)/, `GEMINI_API_KEY=${apiKey.trim()}$1`);
    } else {
      envContent += `\nGEMINI_API_KEY=${apiKey.trim()}\n`;
    }
    fs.writeFileSync(envPath, envContent);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write to .env: ' + err.message });
  }
});

// Get upload history
app.get('/api/autopilot/history', (req, res) => {
  res.json(getHistory());
});

// Get recent logs
app.get('/api/autopilot/logs', (req, res) => {
  res.json(getRecentLogs());
});

// Run Auto-Pilot cycle on demand with live SSE streaming
app.get('/api/autopilot/run', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const sendEvent = (type, data) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    } catch { /* disconnected */ }
  };

  runAutoPilotCycle({
    ytDlpPath: YT_DLP,
    downloadFn: downloadVideo,
    uploadFn: uploadToYouTube,
    oauth2Client,
    onEvent: (type, payload) => {
      sendEvent(type, payload);
    }
  }).then((result) => {
    sendEvent('completed', result);
    res.end();
  }).catch((err) => {
    sendEvent('error', { message: err.message });
    res.end();
  });
});

// ── Start Server ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   YouTube Shorts Uploader                      ║
║   Running at: http://localhost:${PORT}            ║
╚════════════════════════════════════════════════╝
  `);

  if (!process.env.CLIENT_ID || process.env.CLIENT_ID === 'your_client_id_here') {
    console.log('⚠️  No OAuth credentials found!');
    console.log('   Copy .env.example to .env and fill in your CLIENT_ID and CLIENT_SECRET');
    console.log('   Get them from: https://console.cloud.google.com/apis/credentials\n');
  }

  // Initialize Auto-Pilot scheduler
  setupScheduler({
    ytDlpPath: YT_DLP,
    downloadFn: downloadVideo,
    uploadFn: uploadToYouTube,
    oauth2Client
  });
});

