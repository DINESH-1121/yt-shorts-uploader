# YouTube Shorts Uploader & Autonomous AI Studio

Download YouTube Shorts, Instagram Reels, or trending viral videos and upload them directly to your YouTube channel with automated 9:16 vertical formatting, AI viral metadata optimization, smart content mix balancing, and hardware-accelerated transcoding.

---

## 🎯 Target Content Mix & Percentage Allocation

AutoPilot lets you set exact **percentage weights** for each of your Target Channels & Custom Queries (e.g. 33% Anime, 33% Marvel, 34% Gaming):

* **Live Percentage Customization**: Assign percentage targets directly to each source in the Web UI or in `autopilot-config.json`. The UI tracks your total distribution with a live indicator (`Total: 100%`).
* **Historical Deficit Balancing**: Before every evaluation cycle, AutoPilot analyzes recent upload history from `history.json`. It computes the deficit between your target percentage and recent uploads, automatically boosting candidates from under-represented sources so your channel catalog maintains the exact defined content balance.
* **Fair Multi-Source Scanning**: Scans all configured custom channels and keywords fairly without early termination, guaranteeing a diverse candidate pool.
* **AI-Guided Balance Enforcement**: The AI content selection prompt receives your configured content distribution and under-represented priority notices, preventing the system from repeatedly uploading the same topic.

---

## 🛡️ AI Quality Checker & Compliance

Before any video is uploaded to YouTube, it passes an automated pre-upload quality and compliance check powered by OpenCode models:

1. **Rule 1: AI-Generated Slop Detection**:
   * **REJECTS**: 100% synthetic AI video loops (Sora, Runway, Kling, Pika hallucinations), generic robotic AI-generated slideshows reading fake scripts/Reddit stories, and low-effort synthetic brainrot.
   * **ALLOWS**: Authentic movie edits, cinematic film clips (e.g., *Dune*, *Marvel Avengers*, *Batman*), anime edits, real video game captures (GTA, Minecraft, Fortnite, etc.), and genuine tech hardware demos.
2. **Rule 2: On-Screen Channel Promo Watermarks**:
   * **REJECTS**: Visible on-screen text, burnt-in watermarks, or overlays inside the **video frames** that promote competitor YouTube channels or social handles (e.g., *"Subscribe to @Channel"*, *"youtube.com/@..."*, or promotional creator watermarks).
   * **EXEMPT (ALLOWS)**: Video titles and descriptions are **100% exempt**. Mentioning real actors (e.g., *Timothée Chalamet*, *Robert Downey Jr*, *Zendaya*), celebrities, directors, streamers, or characters in titles and descriptions is fully supported and will never cause a rejection.

---

## ⚡ High-Performance Pipeline & Hardware Acceleration

* **Apple Silicon M3 Pro Hardware Acceleration (`h264_videotoolbox`)**:
  * On macOS, FFmpeg automatically utilizes Apple's dedicated hardware Media Engine (`-c:v h264_videotoolbox -b:v 18M -maxrate 24M -pix_fmt yuv420p`).
  * Drops 9:16 vertical Short formatting times from **30–40 seconds of software CPU rendering down to just 1–2 seconds** at studio master bitrate (18–24 Mbps), using 0% CPU.
* **Pre-Transcode Quality Gate**:
  * The AI Quality Check evaluates raw video frames **before** any FFmpeg transcoding begins.
  * If a candidate is rejected, it is immediately deleted without wasting 30 seconds of heavy transcoding compute and disk I/O.
* **Single-Pass Stream Download**:
  * Eliminates redundant `yt-dlp --skip-download` metadata round-trips, jumping straight into high-speed downloading of the highest quality stream (`bv*+ba/b` sorted by resolution and bitrate).
* **Storage Hygiene & Orphan Cleanup**:
  * Intermediate files are purged ephemerally. Stale `.part` files or temporary downloads are cleaned automatically on startup and during cycles.

---

## 🧠 AI Engine (OpenCode Free Tier)

All AI tasks (candidate selection, viral title/description rewriting, trend-query generation, and visual quality checking) run through `lib/aiClient.js`, a dynamic gateway built on **OpenCode's free models**:

* **Dynamic Discovery**: Pulls live free models from the OpenCode service (`opencode api get /api/model`). Every model with a `-free` id is a candidate and automatically supported.
* **Automatic Failover**: If the preferred model encounters an issue, it cools down automatically and the next healthy model is used without interrupting uploads.
* **Task-Aware Ordering**: Fast flash models (GLM, MiMo, DeepSeek Free) handle metadata rewriting; vision/reasoning models (Nemotron Super VL, GLM Flash) handle visual quality checks and candidate evaluation.
* **Zero API Key Requirement**: Runs locally through the OpenCode CLI (`opencode run --model provider/model --format json`).
* **Session Hygiene**: Runs in throwaway sessions to keep local session stores clean.

---

## 🛠️ How It Works

```
┌────────────────┐          ┌──────────────────────┐          ┌─────────────────────┐
│                │  (1) URL │                      │ (3) Info │                     │
│   Web Client   ├─────────►│    Express Server    ├─────────►│       yt-dlp        │
│  (HTML/CSS/JS) │          │     (Node.js)        │◄─────────┤     (+ ffmpeg)      │
│                │◄─────────┤                      │ (4) mp4  │                     │
└────────────────┘  (5) SSE └──────────┬───────────┘          └─────────────────────┘
     Progress & Status Updates         │
                                       │ (6) Upload Stream
                                       ▼
                            ┌─────────────────────┐
                            │ YouTube Data API v3 │
                            │   (Google Cloud)    │
                            └─────────────────────┘
```

1. **OAuth 2.0 Authorization**: Connects securely to YouTube Data API v3 with persistent offline tokens in `tokens.json`.
2. **Quality-First Extraction**: Downloads pristine audio and video streams via `yt-dlp` with `-f "bv*+ba/b" --merge-output-format mp4`.
3. **Strict 9:16 Shorts Formatting**: Analyzes aspect ratio with `ffprobe`. Horizontal clips are formatted into centered foregrounds with blurred ambient backgrounds at 1080x1920 ($\le 59.5$s duration).
4. **Viral Metadata & SEO Optimization**: Auto-generates high-CTR titles and descriptions containing 25–30 relevant hashtags tailored to the video topic.
5. **Real-Time Progress Streaming**: Emits live status updates via Server-Sent Events (SSE).

---

## ⚙️ Configuration & Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLIENT_ID` | required | Google Cloud OAuth Client ID |
| `CLIENT_SECRET` | required | Google Cloud OAuth Client Secret |
| `PORT` | `3000` | Web server port |
| `TREND_CACHE_HOURS` | `1` | Trend query cache TTL in hours (`0` disables caching) |
| `SCAN_CONCURRENCY` | `3` | Parallel source scan workers (max 4) |
| `FFMPEG_PATH` | auto | Custom path to `ffmpeg` binary |
| `FFPROBE_PATH` | auto | Custom path to `ffprobe` binary |
| `AI_KEEP_SESSIONS` | unset | Retain OpenCode debug sessions |

---

## 🚀 Quick Start

### 1. Set up Google Cloud Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/) and enable **YouTube Data API v3**.
2. Create an **OAuth 2.0 Client ID** (Web Application) with redirect URI: `http://localhost:3000/oauth2callback`.
3. Add your email under **Audience / Test users**.
4. Put your credentials in `.env`:
   ```env
   CLIENT_ID=your_client_id
   CLIENT_SECRET=your_client_secret
   PORT=3000
   ```

### 2. Install Dependencies
```bash
brew install yt-dlp ffmpeg
npm install
```

### 3. Start the Server
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔗 Supported URLs

| Platform | URL Format |
| --- | --- |
| YouTube Shorts | `https://youtube.com/shorts/<id>` |
| YouTube Videos | `https://youtube.com/watch?v=<id>` |
| YouTube Short links | `https://youtu.be/<id>` |
| Instagram Reels | `https://instagram.com/reel/<id>/` |
| Instagram Posts | `https://instagram.com/p/<id>/` |
