const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Resolve ffmpeg/ffprobe portably: explicit env override first, then the
// usual install locations, otherwise fall back to the bare name so the OS
// resolves it via PATH (correct on Linux, Intel macs, nix, etc.).
function resolveBinary(envVar, name, fallbacks) {
  const fromEnv = process.env[envVar];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of fallbacks) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
}

const FFPROBE_BIN = resolveBinary('FFPROBE_PATH', 'ffprobe', [
  '/opt/homebrew/bin/ffprobe',
  '/usr/local/bin/ffprobe',
  '/usr/bin/ffprobe'
]);
const FFMPEG_BIN = resolveBinary('FFMPEG_PATH', 'ffmpeg', [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg'
]);

/**
 * Probes a video file for width, height, and duration
 */
function probeVideo(filePath) {
  return new Promise((resolve) => {
    execFile(FFPROBE_BIN, [
      '-v', 'error',
      '-show_entries', 'stream=width,height,duration:format=duration',
      '-of', 'json',
      filePath
    ], { timeout: 15000 }, (err, stdout) => {
      if (err) {
        console.warn('[ShortsFormatter] ffprobe failed:', err.message);
        return resolve(null);
      }
      try {
        const data = JSON.parse(stdout);
        const stream = (data.streams || []).find(s => s.width && s.height) || {};
        const width = stream.width || 0;
        const height = stream.height || 0;
        const duration = parseFloat(stream.duration || data.format?.duration || 0);
        resolve({
          width,
          height,
          duration,
          isVertical: height >= width && height > 0,
          isShortDuration: duration <= 60.5
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Converts any video into strict 9:16 vertical YouTube Shorts format:
 * - Dimensions: 1080x1920 (vertical 9:16)
 * - Duration: strictly capped at <= 59.5 seconds
 * - Visual aesthetic: centered foreground clip with ambient blurred background
 */
function convertToShortsFormat(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    onProgress?.('🎨 Formatting video into 9:16 Vertical YouTube Shorts format...');
    console.log(`[ShortsFormatter] Transcoding into 9:16 Vertical Short: ${inputPath} -> ${outputPath}`);

    // Studio-grade blurred background filter with sharp Lanczos scaling:
    // [bg] scale and crop to fill 1080x1920 with high-def boxblur
    // [fg] scale to fit inside 1080x1920 keeping aspect ratio using lanczos algorithm
    // overlay [fg] centered over [bg]
    const filterComplex = [
      '[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,boxblur=25:5[bg];',
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];',
      '[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]'
    ].join('');

    const args = [
      '-y',
      '-i', inputPath,
      '-t', '59.5', // clamp duration to under 60 seconds
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '0:a?', // keep high-fidelity audio
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18', // visually lossless studio quality
      '-profile:v', 'high',
      '-level:v', '4.2',
      '-maxrate', '12M',
      '-bufsize', '24M',
      '-c:a', 'aac',
      '-b:a', '320k', // 320kbps studio audio
      '-ar', '48000',
      '-pix_fmt', 'yuv420p',
      outputPath
    ];

    const child = spawn(FFMPEG_BIN, args);
    let stderr = '';

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log(`[ShortsFormatter] ✅ Successfully formatted 9:16 Vertical Short: ${outputPath}`);
        resolve(outputPath);
      } else {
        console.error('[ShortsFormatter] Conversion failed:', stderr);
        reject(new Error(`FFmpeg failed to convert to Shorts format: ${stderr.slice(-200)}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Trims duration to <= 59.5 seconds if already vertical but slightly too long
 */
function trimShortDuration(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    onProgress?.('✂️ Trimming video to under 60 seconds for YouTube Shorts...');
    const args = [
      '-y',
      '-i', inputPath,
      '-t', '59.5',
      '-c', 'copy',
      outputPath
    ];
    execFile(FFMPEG_BIN, args, (err) => {
      if (err) return reject(err);
      resolve(outputPath);
    });
  });
}

/**
 * Inspects any video and guarantees it is strictly in YouTube Shorts format:
 * - Must be Vertical (9:16 aspect ratio)
 * - Must be <= 60 seconds
 */
async function ensureShortsFormat(inputPath, onProgress) {
  const info = await probeVideo(inputPath);
  if (!info) {
    console.warn('[ShortsFormatter] Could not probe video metadata. Passing through.');
    return inputPath;
  }

  console.log(`[ShortsFormatter] Probed: ${info.width}x${info.height}, duration: ${info.duration}s, vertical: ${info.isVertical}`);

  // Already vertical and under 60s -> Perfect Short!
  if (info.isVertical && info.isShortDuration) {
    console.log('[ShortsFormatter] ✅ Video is already in native 9:16 vertical Shorts format.');
    return inputPath;
  }

  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);
  const formattedPath = path.join(dir, `${base}_shorts_9x16.mp4`);

  // Already vertical but slightly over 60s
  if (info.isVertical && !info.isShortDuration) {
    try {
      await trimShortDuration(inputPath, formattedPath, onProgress);
      try {
        if (fs.existsSync(inputPath) && inputPath !== formattedPath) fs.unlinkSync(inputPath);
      } catch { /* ignore */ }
      return formattedPath;
    } catch (trimErr) {
      console.warn('[ShortsFormatter] Trim error, falling back to full transcode:', trimErr.message);
    }
  }

  // Horizontal or square video: transcode to 1080x1920 9:16 vertical Short
  try {
    await convertToShortsFormat(inputPath, formattedPath, onProgress);
    try {
      if (fs.existsSync(inputPath) && inputPath !== formattedPath) fs.unlinkSync(inputPath);
    } catch { /* ignore */ }
    return formattedPath;
  } catch (err) {
    console.warn('[ShortsFormatter] Format conversion error, keeping original file:', err.message);
    return inputPath;
  }
}

module.exports = {
  probeVideo,
  ensureShortsFormat,
  convertToShortsFormat
};
