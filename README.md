# YouTube Shorts Uploader

Download YouTube Shorts or Instagram Reels and upload them directly to your YouTube channel.

---

## 🧠 AI Engine (OpenCode Free Tier)

All AI tasks (candidate selection, viral title/description rewriting, trend-query generation) run through `lib/aiClient.js`, a dynamic gateway built on **OpenCode's free models**:

* **Dynamic discovery** — the free-model list is pulled live from the OpenCode service (`opencode api get /api/model`). Every model with a `-free` id is a candidate, so new free models OpenCode ships are picked up automatically (cached for 5 minutes, falls back to a built-in preference list offline).
* **Automatic failover** — if the preferred model errors, times out, or returns unparseable output, it is marked unhealthy with an escalating cooldown (3 → 6 → 12 min, cap 30) and the next best free model is tried until one succeeds. A failed model is never retried back-to-back. Each attempt is capped at **60 s** and the whole chain at **180 s**, so a total outage degrades to the heuristic path in ~3 minutes instead of hanging.
* **Task-aware ordering** — fast flash-class models (GLM/MiMo/DeepSeek Free) serve metadata & trend-query tasks first; deeper reasoning-class models (Nemotron Ultra) rank higher for candidate selection.
* **No API keys needed** — the free tier is consumed through the OpenCode CLI (`opencode run --model provider/model --format json`), which must therefore be installed and the `opencode` service running.
* **Session hygiene** — each call runs in a throwaway OpenCode session that is deleted afterwards, so the project's session list does not grow one entry per AI run. Set `AI_KEEP_SESSIONS=1` to keep them for debugging.
* **Guaranteed output** — `generateJSON` tolerates markdown fences and surrounding prose; if every model fails, the engine degrades gracefully to the built-in heuristic scoring (keyword-based selection + canned hashtags) so uploads never block.

The preferred model is configurable in the web UI (Auto-Pilot card, models listed live via `GET /api/ai/models`) and stored as `geminiModel` in `autopilot-config.json` (field name kept for backward compatibility; values are now `opencode/...-free` refs).

### Cycle performance

A cycle only needs **one** model call: generated trend queries are cached in `trend-queries.json` for 6 hours (`TREND_CACHE_HOURS` to change, `forceRefresh` to bypass), so the expensive part is candidate selection. On top of that, configured sources are scanned concurrently with trend discovery, source scans run in a worker pool (`SCAN_CONCURRENCY`, default 3), and the 9:16 transcode uses the x264 `fast` preset with `+faststart` (CRF 18 quality is unchanged). Native-vertical clips under 60 s skip transcoding entirely.

### Tuning (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_KEEP_SESSIONS` | unset | Keep throwaway AI sessions for debugging |
| `TREND_CACHE_HOURS` | `6` | Trend-query cache TTL (`0` disables caching) |
| `SCAN_CONCURRENCY` | `3` | Parallel source scans (max 4) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | auto | Override the resolved ffmpeg/ffprobe binaries |

To smoke-test the gateway: `node smoke-test-ai.js`.

### Troubleshooting

* **`Sign in to confirm you're not a bot` / downloads fail at video info** — YouTube is blocking anonymous extraction. Sign in to YouTube in a desktop browser, then set `YTDLP_COOKIES_FROM_BROWSER=chrome` (or `edge`/`safari`) in `.env`, or export a `cookies.txt` and set `YTDLP_COOKIES=/path/to/cookies.txt`. Restart the server and the scanner, download and metadata-preview paths all pick it up. On a VPN/datacenter IP, disabling the VPN also often clears it. Verify manually with `yt-dlp --skip-download --print "%(title)s" --cookies-from-browser chrome "<url>"`.
* **`[AIClient] Discovery failed ...`** — the OpenCode service isn't reachable; the client falls back to its built-in model list. Check `opencode service status`.
* **Every model cools down ("All OpenCode free models failed")** — quota/outage. Uploads continue in heuristic mode; check the Auto-Pilot terminal log for the reported upstream error.
* **Auto-Pilot logs "cycle is already in progress"** — a cycle is still running; the warning is surfaced at most once per 5 minutes. The minimum cadence is 15 minutes because a full cycle takes minutes.

---

## 🛠️ How It Works (How We Achieve This)

This application links together video extraction tooling, cloud authentication, and streaming protocols to download and publish videos directly to YouTube without manual file handling.

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

### 1. YouTube OAuth 2.0 Authorization
* Uses Google's official `googleapis` SDK to implement an OAuth 2.0 authorization code flow.
* Requests granular scopes: `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube`.
* Secures and persists offline refresh tokens locally in `tokens.json` so you only need to authenticate once.

### 2. Video Extraction via `yt-dlp` & `ffmpeg`
* When a URL is submitted, the server spawns `yt-dlp` to fetch media metadata (title, description, ID).
* **Format Selection & Merging**: YouTube Shorts typically serve video and audio tracks as separate DASH streams. The server instructs `yt-dlp` with `-f "bv*+ba/b" --merge-output-format mp4`, leveraging `ffmpeg` to multiplex high-definition video and audio streams into a single standard MP4 file on the fly.
* Supports extraction from YouTube Shorts, standard YouTube videos, and Instagram Reels/Posts.

### 3. Real-Time Status via Server-Sent Events (SSE)
* Instead of inefficient client polling, the frontend opens an SSE connection (`/api/upload`) using `EventSource`.
* The server parses `yt-dlp` stdout stream in real time to extract download percentage (`[download] XX.X%`).
* Emits live events to smoothly advance the client-side progress bar from 0% to 50% during downloading, and 50% to 100% during the YouTube upload.

### 4. Direct Upload via YouTube Data API v3
* Once the MP4 is compiled in a temporary staging folder (`/downloads`), it is piped via `fs.createReadStream` to `youtube.videos.insert`.
* Uploads metadata including title, description, category ID (`22` - People & Blogs), and privacy status (`private`, `unlisted`, or `public`).
* Tracks bytes transferred and dispatches real-time upload progress to the browser.

### 5. Strict 9:16 Shorts Video Format Enforcement
* **Automatic Aspect Ratio Formatting**: Every video is analyzed via `ffprobe`. If a source clip is horizontal ($width > height$), `ffmpeg` automatically converts it into a high-aesthetic **vertical 9:16 (1080x1920)** YouTube Short with centered foreground and ambient blurred background framing.
* **Duration Clamping**: Strictly enforces YouTube's 60-second limit by capping duration to $\le 59.5$ seconds so the upload is guaranteed to be classified by YouTube as a Short.
* **Categorization & SEO**: Automatically sets category ID to Gaming (`20`) or People & Blogs (`22`) and adds `#Shorts` tags in title and description to guarantee immediate placement in the vertical Shorts shelf.

### 6. Ephemeral File Lifecycle & Security
* To prevent disk bloat and respect storage boundaries, the server deletes staged video files (`fs.unlinkSync`) inside a `finally` block immediately after upload completes or fails.
* All credentials (`.env`) and session tokens (`tokens.json`) are stored strictly on your local machine and excluded from source control.

---

## 🚀 Quick Start

### 1. Set up Google Cloud credentials (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Go to **APIs & Services → Library** → search and enable **YouTube Data API v3**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: anything (e.g. `Shorts Uploader`)
   - Authorized redirect URIs: add `http://localhost:3000/oauth2callback`
5. Go to **APIs & Services → OAuth consent screen → Audience / Test users**, add your Google email address.
6. Copy your **Client ID** and **Client Secret**.

### 2. Configure Environment

Edit the `.env` file and insert your credentials:

```env
CLIENT_ID=your_actual_client_id
CLIENT_SECRET=your_actual_client_secret
PORT=3000
```

### 3. Install System Dependencies

Make sure `yt-dlp` and `ffmpeg` are installed:

```bash
brew install yt-dlp ffmpeg
```

### 4. Install Node Dependencies & Run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Connect YouTube & Upload

1. Click **"Connect YouTube"** and grant channel permissions.
2. Paste a YouTube Short or Instagram Reel URL.
3. Configure optional title/privacy settings and click **Download & Upload**.

---

## 🔗 Supported URLs

| Platform | URL Format |
|---|---|
| YouTube Shorts | `https://youtube.com/shorts/<id>` |
| YouTube Videos | `https://youtube.com/watch?v=<id>` |
| YouTube Short links | `https://youtu.be/<id>` |
| Instagram Reels | `https://instagram.com/reel/<id>/` |
| Instagram Posts | `https://instagram.com/p/<id>/` |

---

## 🔒 Privacy & Safety

* **Zero Cloud Retention**: Media files are only stored temporarily on local disk during transfer and purged immediately after completion.
* **Direct Handshake**: Uploads are transmitted directly between your machine and Google's official API servers.
