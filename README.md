# YouTube Shorts Uploader

Download YouTube Shorts or Instagram Reels and upload them directly to your YouTube channel.

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

### 5. Ephemeral File Lifecycle & Security
* To prevent disk bloat and respect storage boundaries, the server deletes the staged video file (`fs.unlinkSync`) inside a `finally` block immediately after the upload completes or fails.
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
