/**
 * Shared yt-dlp authentication helpers.
 *
 * YouTube now serves a "Sign in to confirm you're not a bot" challenge to
 * anonymous clients on many networks, which no player_client workaround
 * bypasses reliably. The supported fix is authenticating yt-dlp with a browser
 * cookie jar, configured through environment variables:
 *
 *   YTDLP_COOKIES=/path/to/cookies.txt     # exported Netscape cookie file
 *   YTDLP_COOKIES_FROM_BROWSER=chrome      # chrome | edge | safari | firefox ...
 *   YTDLP_PLAYER_CLIENT=default            # optional extractor override
 *
 * YTDLP_COOKIES wins when both are set.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Auth/extractor args to prepend to any yt-dlp invocation.
 */
function authArgs() {
  const args = [];

  const cookiesFile = (process.env.YTDLP_COOKIES || '').trim();
  if (cookiesFile) {
    const resolved = path.isAbsolute(cookiesFile) ? cookiesFile : path.join(PROJECT_ROOT, cookiesFile);
    if (fs.existsSync(resolved)) {
      args.push('--cookies', resolved);
    } else {
      console.warn(`[ytDlp] YTDLP_COOKIES points to a missing file: ${resolved}`);
    }
  } else {
    const browser = (process.env.YTDLP_COOKIES_FROM_BROWSER || '').trim();
    if (browser) {
      args.push('--cookies-from-browser', browser);
    }
  }

  const playerClient = (process.env.YTDLP_PLAYER_CLIENT || '').trim();
  if (playerClient) {
    args.push('--extractor-args', `youtube:player_client=${playerClient}`);
  }

  return args;
}

/**
 * True when yt-dlp output indicates YouTube's bot/authentication challenge.
 */
function isBotCheckError(text) {
  return /sign in to confirm|confirm you.{0,3}re not a bot|not a bot|sign in to view/i.test(String(text || ''));
}

/**
 * True when the configured cookie source is unusable (no such browser profile,
 * unreadable cookie DB, unsupported browser).
 */
function isCookieConfigError(text) {
  return /could not find .*cookies database|unsupported browser|failed to decrypt cookies|operation not permitted.*cookies/i.test(String(text || ''));
}

/**
 * True when a failure needs the user to fix authentication settings.
 */
function hasAuthConfigError(text) {
  return isBotCheckError(text) || isCookieConfigError(text);
}

/**
 * Actionable message for the bot-check failure, including setup steps.
 */
function botCheckHint() {
  return 'YouTube blocked the request with a bot check. '
    + 'Fix: sign in to YouTube in a desktop browser, then set YTDLP_COOKIES_FROM_BROWSER=chrome (or edge/safari) in .env, '
    + 'or export a cookies.txt and set YTDLP_COOKIES=/path/to/cookies.txt. '
    + 'If you are on a VPN or datacenter IP, try disabling it.';
}

/**
 * Actionable message when the configured browser cookie store cannot be read.
 */
function cookieConfigHint(browser) {
  const raw = String(browser || process.env.YTDLP_COOKIES_FROM_BROWSER || 'the configured browser');
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  return `yt-dlp could not read ${name} cookies (no browser profile or cookies DB found). `
    + `Open ${name}, sign in to YouTube, quit the browser completely and retry — or export a cookies.txt and set YTDLP_COOKIES=/path/to/cookies.txt. `
    + 'To turn this off, remove YTDLP_COOKIES_FROM_BROWSER from .env (search-only scanning works without cookies).';
}

/**
 * Decorates an error message for a failed yt-dlp run with an actionable hint.
 */
function describeError(rawError) {
  const text = String(rawError || '');
  if (isBotCheckError(text)) {
    return `${botCheckHint()} (yt-dlp said: ${text.replace(/\s+/g, ' ').slice(0, 180)})`;
  }
  if (isCookieConfigError(text)) {
    const browserMatch = text.match(/could not find (\w+) cookies database/i);
    return cookieConfigHint(browserMatch ? browserMatch[1] : undefined);
  }
  return text;
}

module.exports = {
  authArgs,
  isBotCheckError,
  isCookieConfigError,
  hasAuthConfigError,
  botCheckHint,
  cookieConfigHint,
  describeError,
  PROJECT_ROOT
};
