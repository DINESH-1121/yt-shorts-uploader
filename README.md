# YouTube Shorts Studio & Autonomous AI Auto-Pilot

An enterprise-grade, fully autonomous YouTube Shorts curation, formatting, and publishing suite powered by **local Apple Silicon MLX GPU acceleration**, **Google Gemini Pro fallback**, **Apple VideoToolbox hardware transcoding**, and a **Strict Anti-Repetition Duplicate Prevention Engine**.

---

## 🌟 Key Highlights & Features

* **⚡ Local Apple Silicon MLX GPU Acceleration**:
  * Runs **Llama 3.2 3B Instruct 4-bit** natively on your Mac's Metal GPU with unified memory.
  * Generates high-CTR viral titles and rich SEO descriptions at **100+ tokens/second** (~1.8s response time) with **zero external rate limits, zero quotas, and zero API costs**.
  * Built-in automatic background lifecycle manager (`ensureMLXServer`) that spins up the local OpenAI-compatible HTTP daemon on demand.
* **🚫 Strict Anti-Repetition Duplicate Prevention**:
  * Multi-layer canonical ID extraction engine supporting YouTube Shorts (`/shorts/`), regular videos (`/watch?v=`), short links (`youtu.be/`), and Instagram Reels (`/reel/`).
  * **Zero Double Downloads**: Pre-filters duplicate videos at 4 independent stages: scanner intake, candidate queueing, pre-download validation, and manual upload submission.
  * High-capacity persistent tracking (`history.json`) preserving canonical IDs and URLs permanently across thousands of uploads.
* **📝 Rich Video Descriptions with 25–30 Guaranteed Hashtags**:
  * Automatically extracts original context and narrative hooks to describe what actually happens in the video.
  * Formats clean, friendly Calls to Action (Like, Comment, Subscribe) and gives proper credit to original creators (`@uploader`).
  * Dynamically populates and deduplicates **exactly 25 to 30 relevant, high-velocity hashtags** spanning niche-specific tags (Anime, Gaming, Marvel, Tech, Movie) and universal Shorts viral tags.
* **🎯 Target Content Mix & Automatic Deficit Balancing**:
  * Define exact percentage targets for your channels and queries (e.g., 25% Anime, 25% Marvel, 25% Gaming, 25% Tech).
  * AutoPilot computes historical upload deficits from `history.json` and automatically prioritizes under-represented categories to maintain the exact desired channel distribution.
* **🛡️ Dual-Rule AI Quality & Safety Guard**:
  * **Rule 1 (AI Slop Detection)**: Rejects 100% synthetic hallucinations (Sora, Runway, Kling, Pika loops) and low-effort robotic brainrot, while approving authentic gameplay, cinema edits, and anime clips.
  * **Rule 2 (Promo Watermark Rejection)**: Rejects on-screen burnt-in promos, watermarks, or overlays directing viewers to rival YouTube channels. Title and description mentions of celebrities and actors are 100% exempt.
  * **Pre-Transcode Gate**: Evaluates raw video frames *before* transcoding, saving disk I/O and compute on rejected videos.
* **🚀 Hardware-Accelerated 9:16 Vertical Transcoding**:
  * Utilizes Apple's dedicated hardware Media Engine via `h264_videotoolbox` on macOS.
  * Converts horizontal clips to 9:16 vertical format (1080x1920 $\le 59.5$s) with blurred ambient backgrounds in **1–2 seconds** at master quality (18–24 Mbps).
* **🌐 Web Dashboard & Real-Time Monitoring**:
  * Sleek dark-mode Studio dashboard with live Server-Sent Events (SSE) streaming real-time download, AI reasoning, transcoding, and upload progress.

---

## 🏗️ Architecture & Pipeline Flow

```
┌─────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│  Multi-Source   ├──────►│  Canonical Duplicate ├──────►│  Candidate Queue     │
│  Intake Scanner │       │  Prevention Engine   │       │  & Deficit Balancing │
└─────────────────┘       └──────────────────────┘       └──────────┬───────────┘
                                                                    │
                                                                    ▼
┌─────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│ YouTube Data v3 │◄──────┤ Apple VideoToolbox   │◄──────┤ Pre-Upload AI        │
│ API Publisher   │       │ 9:16 Hardware Encode │       │ Quality Guard        │
└─────────────────┘       └──────────────────────┘       └──────────────────────┘
```

1. **Source Discovery**: Ingests candidate shorts via configured keywords, channel handles, and dynamic trending search pools.
2. **Duplicate Filtering**: Canonical 11-character video IDs are checked against `history.json`. Any previously downloaded or uploaded video is immediately discarded.
3. **AI Selection & SEO Formulation**: The local Apple Silicon MLX GPU evaluates candidate options against content distribution percentages, crafting a click-worthy title, rich description, and 25–30 hashtags.
4. **Primacy Download**: Downloads master video streams via `yt-dlp` using cookie authentication to bypass bot protections.
5. **Quality Verification**: Extracts 3 representative video keyframes and verifies compliance against slop and competitor promos.
6. **Hardware Transcoding**: FFmpeg with `h264_videotoolbox` transcodes the video to vertical 9:16 Short format in under 2 seconds.
7. **YouTube Upload**: Streams video to YouTube API v3 with real-time percentage progress, records canonical ID in history, and clears temporary files.

---

## ⚡ Local Apple Silicon MLX Engine

The AI gateway ([`lib/aiClient.js`](lib/aiClient.js)) connects directly to Apple's **MLX** framework running on Apple Silicon unified memory:

* **Default Local Model**: [`mlx-community/Llama-3.2-3B-Instruct-4bit`](https://huggingface.co/mlx-community/Llama-3.2-3B-Instruct-4bit) (~1.8 GB memory footprint).
* **Metal GPU Speed**: **103+ tokens/sec** (~1.8s for complete video evaluation and metadata generation).
* **Automated Daemon**: Node automatically launches the server on port `8080` if not already running.
* **Cloud Fallback**: Automatically cascades to Google Gemini (`gemini-2.5-flash` with 1,500 req/day quota) if MLX is unreachable or explicitly disabled.

### Useful MLX Commands
```bash
# Start the MLX server manually:
npm run mlx:start

# Interactive CLI chat with the local model:
.venv-mlx/bin/python -m mlx_lm chat --model mlx-community/Llama-3.2-3B-Instruct-4bit

# Run quick one-liner completions:
.venv-mlx/bin/python -m mlx_lm generate --model mlx-community/Llama-3.2-3B-Instruct-4bit --prompt "Write 3 viral short titles for GTA 6"
```

---

## 🚫 Anti-Repetition & Duplicate Prevention

To guarantee your YouTube channel never uploads the same video twice:

* **Canonical Normalization**: Standardizes URLs across all variations:
  * `https://youtube.com/shorts/DManF7dWTJM` ➔ `DManF7dWTJM`
  * `https://www.youtube.com/watch?v=DManF7dWTJM` ➔ `DManF7dWTJM`
  * `https://youtu.be/DManF7dWTJM` ➔ `DManF7dWTJM`
  * `https://instagram.com/reel/C-xyz123/` ➔ `C-xyz123`
* **4-Gate Enforcement**:
  1. **Scanner Intake Gate**: Skips known videos before candidate extraction completes.
  2. **AutoPilot Pool Gate**: Filters remaining candidates before sending prompts to the AI.
  3. **Pre-Download Gate**: Validates the winning video's canonical ID right before triggering network download.
  4. **Manual Upload Gate**: Rejects duplicate URLs pasted into the single-video upload form.
* **Persistent History**: `history.json` retains up to 5,000 processed videos (both uploaded and permanently rejected), preventing duplicates across days, weeks, and months.

---

## 📝 Video Descriptions & 25–30 Hashtags Engine

Every generated video description adheres to a strict SEO formula:

1. **Context-Aware Summary**: 2–3 engaging sentences explaining the specific highlight, gameplay clutch, or scene.
2. **Call to Action (CTA)**: Encourages engagement (`Drop a like, comment your thoughts, and subscribe for daily shorts!`).
3. **Attribution**: Credits the original creator (`Original creator: @CreatorName`).
4. **Hashtag Bank (Minimum 25–30 Tags)**:
   * **Anime**: `#shorts #anime #animedit #jujutsukaisen #demonslayer #naruto #onepiece #otaku #animefight #amv ...`
   * **Gaming**: `#shorts #gaming #minecraft #gta6 #eldenring #valorant #clutch #gamers #gameplay #nextgen ...`
   * **Marvel / Film**: `#shorts #marvel #avengers #mcu #doomsday #cinema #cinematography #hollywood #filmtok ...`
   * **Tech / Innovation**: `#shorts #technology #tech #innovation #gadgets #ai #robotics #futuretech #smartdevices ...`
   * **Viral Velocity**: `#shorts #viral #trending #fyp #foryou #viralshorts #trendingshorts #explore #reels ...`

---

## 📋 Prerequisites

* **Operating System**: macOS 13.5+ (Optimized for Apple Silicon M1 / M2 / M3 / M4)
* **Node.js**: v18.0.0 or higher
* **Python**: 3.10+ (Homebrew Python 3.12 recommended)
* **System Binaries**:
  ```bash
  brew install ffmpeg yt-dlp
  ```

---

## 🚀 Quick Setup & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/Dinesh-Cheekuri/Yt-to-shorts.git
cd "Yt to shorts"
```

### 2. Install Node Dependencies
```bash
npm install
```

### 3. Set Up Local MLX Environment (Apple Silicon)
```bash
# Create dedicated Python virtual environment:
/opt/homebrew/bin/python3.12 -m venv .venv-mlx

# Install Apple Silicon Metal MLX packages:
.venv-mlx/bin/pip install mlx mlx-lm
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` with your Google Cloud OAuth credentials and preferences:
```env
# Google OAuth 2.0 Credentials (from Google Cloud Console)
CLIENT_ID=your_client_id_here.apps.googleusercontent.com
CLIENT_SECRET=your_client_secret_here

# Server Port
PORT=3000

# Local Apple Silicon MLX GPU Configuration
USE_MLX=true
MLX_MODEL=mlx-community/Llama-3.2-3B-Instruct-4bit
MLX_BASE_URL=http://127.0.0.1:8080

# Cloud Fallback (Optional)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
DISABLE_OPENCODE=true

# Optional yt-dlp Netscape cookies file to bypass bot challenges
YTDLP_COOKIES=cookies.txt
```

### 5. Set Up Google Cloud OAuth
1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Enable the **YouTube Data API v3**.
3. Create an **OAuth 2.0 Client ID** (Application type: *Web application*).
4. Add Authorized Redirect URI: `http://localhost:3000/oauth2callback`.
5. Under **OAuth consent screen ➔ Test users**, add your YouTube account email.

---

## 🎮 Running the Application

### Start the Studio Server
```bash
npm start
```
* Visit [http://localhost:3000](http://localhost:3000) in your browser.
* Click **Connect YouTube** to link your channel.
* Configure your AutoPilot schedule, percentage weights, and topic sources.
* Click **Save & Run Cycle** or let the automated cron handle publishing hands-free.

### Development Mode (Auto-Reload)
```bash
npm run dev
```

---

## ⚙️ Configuration File Reference (`autopilot-config.json`)

```json
{
  "enabled": true,
  "privacy": "public",
  "cadence": {
    "mode": "interval",
    "intervalValue": 30,
    "intervalUnit": "minutes"
  },
  "sources": [
    {
      "type": "keyword",
      "url": "Anime",
      "name": "Anime Highlights",
      "percentage": 25
    },
    {
      "type": "keyword",
      "url": "Marvel Avengers Doomsday",
      "name": "Marvel & Cinema",
      "percentage": 25
    },
    {
      "type": "keyword",
      "url": "insane viral gaming clips shorts",
      "name": "Gaming Clutches",
      "percentage": 25
    },
    {
      "type": "keyword",
      "url": "futuristic tech innovations gadgets shorts",
      "name": "Tech & AI",
      "percentage": 25
    }
  ],
  "maxCandidates": 12
}
```

---

## 🛡️ License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
