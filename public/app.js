// ── DOM Elements ─────────────────────────────────────────────────────────
const btnConnect = document.getElementById('btn-connect');
const connectedBadge = document.getElementById('connected-badge');

// Manual Upload Elements
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

// Auto-Pilot Elements
const autopilotToggle = document.getElementById('autopilot-toggle');
const toggleLabel = document.getElementById('toggle-label');
const autopilotIndicator = document.getElementById('autopilot-indicator');
const btnRunAutopilot = document.getElementById('btn-run-autopilot');
const btnRunText = btnRunAutopilot.querySelector('.btn-text');
const btnRunLoading = btnRunAutopilot.querySelector('.btn-loading');
const geminiBadge = document.getElementById('gemini-badge');
const geminiStatusText = document.getElementById('gemini-status-text');
const geminiApiKeyInput = document.getElementById('gemini-api-key');
const autoSchedule = document.getElementById('auto-schedule');
const autoPrivacy = document.getElementById('auto-privacy');
const autoNiche = document.getElementById('auto-niche');
const autoTrending = document.getElementById('auto-trending');
const sourcesList = document.getElementById('sources-list');
const autopilotLog = document.getElementById('autopilot-log');
const historyContainer = document.getElementById('history-container');

let uploadFinished = false;
let autopilotConfig = null;

// ── Tab Navigation ───────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(v => v.classList.add('hidden'));

  if (tab === 'manual') {
    document.getElementById('tab-btn-manual').classList.add('active');
    document.getElementById('view-manual').classList.remove('hidden');
  } else {
    document.getElementById('tab-btn-autopilot').classList.add('active');
    document.getElementById('view-autopilot').classList.remove('hidden');
    loadAutoPilotConfig();
    loadHistory();
  }
}

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

// ── Manual Upload ────────────────────────────────────────────────────────
function startUpload() {
  const url = document.getElementById('video-url').value.trim();
  if (!url) {
    showError('Please paste a video URL');
    return;
  }

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

  const params = new URLSearchParams({ url, privacy });
  if (title) params.set('title', title);
  if (description) params.set('description', description);

  uploadFinished = false;
  setUploading(true);

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
        const pctMatch = data.message.match(/(\d+\.?\d*)%/);
        if (pctMatch) {
          const pct = parseFloat(pctMatch[1]);
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
    if (!uploadFinished) {
      showError('Connection lost. Please try again.');
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

// ── Auto-Pilot Functions ─────────────────────────────────────────────────

async function loadAutoPilotConfig() {
  try {
    const res = await fetch('/api/autopilot/config');
    const data = await res.json();
    autopilotConfig = data.config;

    // Toggle state
    autopilotToggle.checked = !!autopilotConfig.enabled;
    toggleLabel.textContent = autopilotConfig.enabled ? 'ON' : 'OFF';
    toggleLabel.classList.toggle('active', !!autopilotConfig.enabled);

    autopilotIndicator.textContent = autopilotConfig.enabled ? 'ACTIVE' : 'OFF';
    autopilotIndicator.className = autopilotConfig.enabled ? 'pill-badge pill-on' : 'pill-badge pill-off';

    // Gemini status
    if (data.hasGeminiKey) {
      geminiBadge.textContent = 'Active';
      geminiBadge.className = 'pill-badge pill-on';
      geminiStatusText.textContent = 'Gemini 2.5 Flash connected and ready to evaluate videos.';
    } else {
      geminiBadge.textContent = 'Key Needed';
      geminiBadge.className = 'pill-badge pill-off';
      geminiStatusText.textContent = 'Add your API key below for deep AI evaluation (or runs in smart heuristic mode).';
    }

    // Schedule & Privacy
    if (autopilotConfig.schedule) {
      autoSchedule.value = autopilotConfig.schedule;
    }
    if (autopilotConfig.privacy) {
      autoPrivacy.value = autopilotConfig.privacy;
    }
    if (autopilotConfig.nicheFocus) {
      autoNiche.value = autopilotConfig.nicheFocus;
    }
    autoTrending.checked = autopilotConfig.autoTrending !== false;

    renderSources();
  } catch (err) {
    console.error('Failed to load autopilot config:', err);
  }
}

function renderSources() {
  if (!autopilotConfig || !autopilotConfig.sources) return;
  sourcesList.innerHTML = '';

  if (autopilotConfig.sources.length === 0) {
    sourcesList.innerHTML = '<div class="empty-state">No sources added yet. Add a channel URL or keyword below.</div>';
    return;
  }

  autopilotConfig.sources.forEach((src, idx) => {
    const div = document.createElement('div');
    div.className = 'source-item';
    div.innerHTML = `
      <div class="source-meta">
        <span class="source-type-tag">${src.type || 'source'}</span>
        <span class="source-name" title="${src.url}">${src.name || src.url}</span>
      </div>
      <button class="btn-icon-del" onclick="deleteSource(${idx})" title="Remove source">✕</button>
    `;
    sourcesList.appendChild(div);
  });
}

async function toggleAutoPilot(isChecked) {
  if (!autopilotConfig) return;
  autopilotConfig.enabled = isChecked;

  toggleLabel.textContent = isChecked ? 'ON' : 'OFF';
  toggleLabel.classList.toggle('active', isChecked);
  autopilotIndicator.textContent = isChecked ? 'ACTIVE' : 'OFF';
  autopilotIndicator.className = isChecked ? 'pill-badge pill-on' : 'pill-badge pill-off';

  await saveAutoPilotConfig();
  addTerminalLog(`Auto-Pilot scheduler turned ${isChecked ? 'ON' : 'OFF'}.`);
}

async function updateSettings() {
  if (!autopilotConfig) return;
  autopilotConfig.schedule = autoSchedule.value;
  autopilotConfig.privacy = autoPrivacy.value;
  autopilotConfig.nicheFocus = autoNiche.value;
  autopilotConfig.autoTrending = autoTrending.checked;
  await saveAutoPilotConfig();
  addTerminalLog(`Preferences updated: [Focus: ${autoNiche.value}] [Auto-Trending: ${autoTrending.checked ? 'ON' : 'OFF'}].`);
}

async function addSource() {
  const type = document.getElementById('new-source-type').value;
  const input = document.getElementById('new-source-url');
  const val = input.value.trim();

  if (!val) {
    alert('Please enter a channel URL or search keyword');
    return;
  }

  if (!autopilotConfig.sources) autopilotConfig.sources = [];

  let name = val;
  if (type === 'channel' && val.includes('@')) {
    const match = val.match(/@([^/]+)/);
    name = match ? `@${match[1]}` : val;
  }

  autopilotConfig.sources.push({ type, url: val, name });
  input.value = '';
  renderSources();
  await saveAutoPilotConfig();
  addTerminalLog(`Added target source: "${name}" (${type})`);
}

async function deleteSource(idx) {
  if (!autopilotConfig || !autopilotConfig.sources) return;
  const removed = autopilotConfig.sources.splice(idx, 1);
  renderSources();
  await saveAutoPilotConfig();
  if (removed[0]) {
    addTerminalLog(`Removed source: "${removed[0].name || removed[0].url}"`);
  }
}

async function saveGeminiKey() {
  const key = geminiApiKeyInput.value.trim();
  if (!key) {
    alert('Please enter a valid Gemini API Key');
    return;
  }

  try {
    const res = await fetch('/api/autopilot/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key })
    });
    const data = await res.json();
    if (data.ok) {
      geminiApiKeyInput.value = '';
      alert('Gemini API key saved and activated successfully!');
      loadAutoPilotConfig();
      addTerminalLog('Google Gemini API Key successfully saved and connected.');
    } else {
      alert('Error saving key: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to save API key: ' + err.message);
  }
}

async function saveAutoPilotConfig() {
  try {
    await fetch('/api/autopilot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(autopilotConfig)
    });
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

function runAutoPilotNow() {
  btnRunAutopilot.disabled = true;
  btnRunText.classList.add('hidden');
  btnRunLoading.classList.remove('hidden');

  autopilotLog.innerHTML = '';
  addTerminalLog('⚡ Manual trigger initiated...');

  const evtSource = new EventSource('/api/autopilot/run');

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.message) {
        addTerminalLog(data.message);
      }
      if (data.type === 'completed' || data.type === 'done' || data.type === 'error') {
        if (data.type === 'completed') {
          evtSource.close();
          btnRunAutopilot.disabled = false;
          btnRunText.classList.remove('hidden');
          btnRunLoading.classList.add('hidden');
          loadHistory();
        }
      }
    } catch { /* ignore */ }
  };

  evtSource.onerror = () => {
    evtSource.close();
    btnRunAutopilot.disabled = false;
    btnRunText.classList.remove('hidden');
    btnRunLoading.classList.add('hidden');
    loadHistory();
  };
}

function addTerminalLog(msg) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  const time = new Date().toLocaleTimeString();
  div.textContent = `[${time}] ${msg}`;
  autopilotLog.appendChild(div);
  autopilotLog.scrollTop = autopilotLog.scrollHeight;
}

async function loadHistory() {
  try {
    const res = await fetch('/api/autopilot/history');
    const items = await res.json();
    historyContainer.innerHTML = '';

    if (!items || items.length === 0) {
      historyContainer.innerHTML = '<div class="empty-state">No automated uploads yet.</div>';
      return;
    }

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="history-header">
          <span class="history-title">${item.newTitle || 'Uploaded Short'}</span>
          <a class="history-link" href="${item.newVideoUrl}" target="_blank">View on YouTube ↗</a>
        </div>
        ${item.aiReasoning ? `<div class="history-reason">"${item.aiReasoning}"</div>` : ''}
        <div class="history-meta">
          <span>Source: ${item.sourceTitle || item.sourceUrl}</span>
          <span>•</span>
          <span>${item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : ''}</span>
          <span>•</span>
          <span>Privacy: ${item.privacy || 'private'}</span>
        </div>
      `;
      historyContainer.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

// ── Initial Boot ─────────────────────────────────────────────────────────
checkAuth();
loadAutoPilotConfig();
