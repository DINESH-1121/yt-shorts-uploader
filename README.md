# YouTube Shorts Uploader

Download YouTube Shorts or Instagram Reels and upload them directly to your YouTube channel.

## Quick Start

### 1. Set up Google Cloud credentials (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Go to **APIs & Services → Library** → search and enable **YouTube Data API v3**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: anything (e.g. "Shorts Uploader")
   - Authorized redirect URIs: add `http://localhost:3000/oauth2callback`
5. Copy the **Client ID** and **Client Secret**

### 2. Configure the app

Edit the `.env` file and paste your credentials:

```env
CLIENT_ID=your_actual_client_id
CLIENT_SECRET=your_actual_client_secret
PORT=3000
```

### 3. Install yt-dlp (if not already installed)

```bash
brew install yt-dlp
```

### 4. Run the app

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Connect your YouTube account

Click **"Connect YouTube"** and authorize the app. This is a one-time step — your tokens are saved locally.

### 6. Upload a video

Paste a URL like:
- `https://youtube.com/shorts/abc123`
- `https://www.instagram.com/reel/xyz789/`

Choose a privacy setting and click **Download & Upload**!

## Supported URLs

| Platform | URL Pattern |
|----------|-------------|
| YouTube Shorts | `youtube.com/shorts/...` |
| YouTube Videos | `youtube.com/watch?v=...` |
| YouTube Short links | `youtu.be/...` |
| Instagram Reels | `instagram.com/reel/...` |
| Instagram Posts | `instagram.com/p/...` |

## Notes

- Videos are downloaded temporarily and deleted after upload
- Tokens are stored locally in `tokens.json`
- Default upload privacy is **Private** — change it in the upload options
- The app runs locally and never sends your credentials to any third party

