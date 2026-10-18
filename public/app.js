// ── DOM Elements ─────────────────────────────────────────────────────────
const btnConnect = document.getElementById('btn-connect');
const connectedBadge = document.getElementById('connected-badge');
const btnUpload = document.getElementById('btn-upload');
const btnText = btnUpload.querySelector('.btn-text');
const btnLoading = btnUpload.querySelector('.btn-loading');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressLog = document.getElementById('progress-log');
const resultSection = document.getElementById('result-section');
const resultLink = document.getElementById('result-link');
const errorSection = document.getElementById('error-section');
const errorText = document.getElementById('error-text');
const uploadForm = document.getElementById('upload-form');

let uploadFinished = false;

// ── Auth ─────────────────────────────────────────────────────────────────

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    if (data.authenticated) {
      btnConnect.classList.add('hidden');
      connectedBadge.classList.remove('hidden');
    } else {
      btnConnect.classList.remove('hidden');
      connectedBadge.classList.add('hidden');
    }
  } catch {
    btnConnect.classList.remove('hidden');
    connectedBadge.classList.add('hidden');
  }
}

function connectYouTube() {
  window.location.href = '/auth/google';
}

async function disconnect() {
  await fetch('/api/auth/disconnect', { method: 'POST' });
  btnConnect.classList.remove('hidden');
  connectedBadge.classList.add('hidden');
}

// ── Upload ───────────────────────────────────────────────────────────────

function startUpload() {
  const url = document.getElementById('video-url').value.trim();
  if (!url) {
    showError('Please paste a video URL');
    return;
  }

  // Basic URL validation
  const validPatterns = [
    /youtube\.com\/shorts\//,
    /youtu\.be\//,
    /youtube\.com\/watch\?/,
    /instagram\.com\/(reel|reels|p)\//,
    /instagram\.com\/stories\//,
  ];

  if (!validPatterns.some((p) => p.test(url))) {
    showError('Please enter a valid YouTube Shorts or Instagram Reels URL');
    return;
  }

  const title = document.getElementById('video-title').value.trim();
  const description = document.getElementById('video-desc').value.trim();
  const privacy = document.getElementById('video-privacy').value;

  // Build query string
  const params = new URLSearchParams({ url, privacy });
  if (title) params.set('title', title);
  if (description) params.set('description', description);

  // Update UI state
  uploadFinished = false;
  setUploading(true);

  // Open SSE connection
  const evtSource = new EventSource(`/api/upload?${params.toString()}`);

  evtSource.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (data.type) {
      case 'progress': {
        addLog(data.message);
        progressText.textContent = data.message;

        // Parse percentage from message
        const pctMatch = data.message.match(/(\d+\.?\d*)%/);
        if (pctMatch) {
          const pct = parseFloat(pctMatch[1]);
          // If it's the upload phase, shift the bar to 50-100% range
          if (data.message.includes('YouTube')) {
            progressBar.style.width = `${50 + pct / 2}%`;
          } else {
            progressBar.style.width = `${pct / 2}%`;
          }
        }
        break;
      }

      case 'done': {
        uploadFinished = true;
        evtSource.close();
        progressBar.style.width = '100%';
        progressText.textContent = data.message;
        addLog(`✅ ${data.message}`);

        // Show result
        resultLink.href = data.videoUrl;
        resultLink.textContent = data.videoUrl;
        resultSection.classList.remove('hidden');
        progressSection.classList.add('hidden');
        setUploading(false);
        break;
      }

      case 'error': {
        uploadFinished = true;
        evtSource.close();
        showError(data.message);
        break;
      }
    }
  };

  evtSource.onerror = () => {
    evtSource.close();
    // Only show generic error if we haven't already handled a done/error event
    if (!uploadFinished) {
      showError('Connection lost. The server may have crashed or restarted. Please try again.');
    }
  };
}

function showError(message) {
  uploadFinished = true;
  addLog(`❌ ${message}`);
  errorText.textContent = message;
  errorSection.classList.remove('hidden');
  progressSection.classList.add('hidden');
  setUploading(false);
}

function setUploading(isUploading) {
  btnUpload.disabled = isUploading;
  btnText.classList.toggle('hidden', isUploading);
  btnLoading.classList.toggle('hidden', !isUploading);

  if (isUploading) {
    progressSection.classList.remove('hidden');
    resultSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    progressBar.style.width = '0%';
    progressLog.innerHTML = '';
    progressText.textContent = 'Starting...';
  }
}

function addLog(message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = message;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

function resetForm() {
  document.getElementById('video-url').value = '';
  document.getElementById('video-title').value = '';
  document.getElementById('video-desc').value = '';
  document.getElementById('video-privacy').value = 'private';
  resultSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  uploadFinished = false;
  setUploading(false);
}

// ── Init ─────────────────────────────────────────────────────────────────
checkAuth();
