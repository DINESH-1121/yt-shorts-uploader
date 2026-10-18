/**
 * aiClient — dynamic AI gateway powered by OpenCode's free tier.
 *
 * How it works:
 * - Free models are DISCOVERED at runtime via `opencode api get /api/model`
 *   (everything ending in "-free" on the built-in opencode provider).
 *   Any new free model OpenCode ships is picked up automatically.
 * - Calls run through the OpenCode CLI (`opencode run --format json`), which is
 *   the only supported way to consume the free tier.
 * - If a model fails (quota, timeout, bad output, outage), the client marks it
 *   unhealthy with an escalating cooldown and transparently retries the next
 *   best free model. Priority is task-aware: fast "flash"-class models serve
 *   metadata/tagging tasks first, ultra-class models serve deep-reasoning tasks.
 */

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
// Per-model ceiling. Measured successful free-tier calls run 40-55s, so 60s
// leaves headroom without letting a wedged model stall the cycle.
const DEFAULT_TIMEOUT_MS = 60000;
// Ceiling for the whole fallback chain, so a total outage degrades to the
// heuristic path in ~3 minutes instead of 9 models x per-model timeout.
const CHAIN_BUDGET_MS = 180000;
const DISCOVERY_CACHE_MS = 5 * 60 * 1000;

/**
 * Preferred execution order per task class. Anything discovered at runtime
 * that isn't listed here is appended after the preferred set.
 */
const PREFERENCE_TIERS = {
  // Title/hashtag/description writing + trend queries — needs creativity, low latency.
  metadata: [
    'opencode/glm-5.3-flash-free',
    'opencode/mimo-v2.6-flash-free',
    'opencode/deepseek-v4.1-flash-free',
    'opencode/beam-free',
    'opencode/longcat-2.5-preview-free',
    'opencode/space-bunny-free',
    'opencode/nemotron-3.5-lightning-free',
    'opencode/nemotron-3.5-super-vl-free',
    'opencode/nemotron-3-ultra-free'
  ],
  // Video selection / strategy evaluation — deeper reasoning preferred.
  reasoning: [
    'opencode/glm-5.3-flash-free',
    'opencode/nemotron-3-ultra-free',
    'opencode/nemotron-3.5-super-vl-free',
    'opencode/deepseek-v4.1-flash-free',
    'opencode/beam-free',
    'opencode/longcat-2.5-preview-free',
    'opencode/mimo-v2.6-flash-free',
    'opencode/space-bunny-free',
    'opencode/nemotron-3.5-lightning-free'
  ]
};
const DEFAULT_TIER = PREFERENCE_TIERS.metadata;

// In-memory health registry: modelRef -> { failCount, cooldownUntil, lastError }
const health = new Map();
let discoveryCache = { models: null, fetchedAt: 0, pending: null };
// Monotonic per-process counter so concurrent runs never share a temp file.
let runSequence = 0;

function isUnhealthy(modelRef) {
  const record = health.get(modelRef);
  return !!(record && record.cooldownUntil > Date.now());
}

function reportSuccess(modelRef) {
  health.delete(modelRef);
}

function reportFailure(modelRef, err) {
  const record = health.get(modelRef) || { failCount: 0, cooldownUntil: 0, lastError: null };
  record.failCount += 1;
  record.lastError = String(err && err.message || err).slice(0, 200);
  // Escalating cooldown: 3min, 6min, 12min, capped at 30min.
  const cooldownMs = Math.min(30, 3 * Math.pow(2, record.failCount - 1)) * 60 * 1000;
  record.cooldownUntil = Date.now() + cooldownMs;
  health.set(modelRef, record);
  console.warn(`[AIClient] ⚠ ${modelRef} unhealthy for ${Math.round(cooldownMs / 60000)}min (${record.lastError})`);
}

/**
 * Discovery: query the local OpenCode service for every available free model.
 * Falls back to the static tier list if the service is unreachable.
 */
async function discoverFreeModels() {
  const now = Date.now();
  if (discoveryCache.models && (now - discoveryCache.fetchedAt) < DISCOVERY_CACHE_MS) {
    return discoveryCache.models;
  }
  if (discoveryCache.pending) return discoveryCache.pending;

  discoveryCache.pending = (async () => {
    try {
      const stdout = await new Promise((resolve, reject) => {
        execFile('opencode', ['api', 'get', '/api/model'], { cwd: PROJECT_ROOT, timeout: 20000 }, (err, out) => {
          if (err) reject(err); else resolve(out || '');
        });
      });
      const lines = String(stdout).split(/\r?\n/).filter(Boolean);
      let models = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const payload = Array.isArray(parsed) ? parsed : parsed.data || parsed;
          if (Array.isArray(payload)) {
            models = payload
              .filter((m) => typeof m?.id === 'string' && m.id.includes('-free'))
              .map((m) => `${m.providerID || 'opencode'}/${m.modelID || m.id}`);
            break;
          }
        } catch { /* skip non-JSON lines */ }
      }
      if (models.length > 0) {
        discoveryCache = { models, fetchedAt: Date.now(), pending: null };
        console.log(`[AIClient] 🔌 Discovered ${models.length} free OpenCode models`);
        return models;
      }
      throw new Error('No free models found in service response');
    } catch (err) {
      console.warn(`[AIClient] Discovery failed (${String(err.message).slice(0, 120)}), using built-in preference list`);
      const fallback = Object.values(PREFERENCE_TIERS)[0];
      discoveryCache = { models: fallback, fetchedAt: now, pending: null };
      return fallback;
    }
  })();

  return discoveryCache.pending;
}

/**
 * Builds the fallback chain for a task: configured/preferred model first,
 * then the tiered list + any newly discovered free models. Skips models
 * currently in cooldown so a dead model is never retried back-to-back.
 */
async function buildChain(preferredModel, taskTier = 'metadata') {
  const discovered = await discoverFreeModels();
  const tier = PREFERENCE_TIERS[taskTier] || DEFAULT_TIER;

  const ordered = [];
  const push = (ref) => {
    if (ref && !ordered.includes(ref)) ordered.push(ref);
  };

  push(preferredModel);
  for (const ref of tier) push(ref);
  for (const ref of discovered) push(ref);

  // Prefer healthy models first; keep cooled-down models at the tail and only
  // use them when everything else has also failed.
  const healthy = ordered.filter((ref) => !isUnhealthy(ref));
  const cooled = ordered.filter((ref) => isUnhealthy(ref));
  return [...healthy, ...cooled];
}

/**
 * Core executor. Runs a single prompt through `opencode run` with a specific
 * model and returns the concatenated text output.
 *
 * Note: `opencode run` does not emit reliably through a Node pipe, so
 * stdout/stderr are captured to a temp file and read after the process exits.
 * Async spawn with an 'ignore'-ed stdin proves reliable; Node's execFile
 * callback path does not.
 */
function runOpenCode(modelRef, prompt, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const tmpOut = path.join(
      os.tmpdir(),
      `ai-client-${process.pid}-${++runSequence}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`
    );
    let outFd = null;
    let errFd = null;
    let settleAttempts = 0;

    const cleanup = () => {
      if (outFd !== null) try { fs.closeSync(outFd); } catch { /* ignore */ }
      if (errFd !== null) try { fs.closeSync(errFd); } catch { /* ignore */ }
    };

    try {
      outFd = fs.openSync(tmpOut, 'w');
      errFd = fs.openSync(tmpOut, 'a');
    } catch (err) {
      reject(new Error(`Could not create temp output for ${modelRef}: ${err.message}`));
      return;
    }

    const child = spawn(
      'opencode',
      ['run', '--model', modelRef, '--format', 'json', '--log-level', 'error', prompt],
      { cwd: PROJECT_ROOT, stdio: ['ignore', outFd, errFd] }
    );

    const finish = (fn, arg) => {
      if (settleAttempts) return;
      settleAttempts = 1;
      clearTimeout(timer);
      cleanup();
      try { fs.unlinkSync(tmpOut); } catch { /* already gone */ }
      fn(arg);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }, 5000);
      finish(() => {}, new Error(`${modelRef} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (err) => {
      finish(reject, new Error(`${modelRef} spawn failed: ${String(err.message || err).slice(0, 200)}`));
    });

    child.on('exit', (code, signal) => {
      let stdout = '';
      try { stdout = fs.readFileSync(tmpOut, 'utf8'); } catch { /* ignore */ }

      if (signal) {
        finish(reject, new Error(`${modelRef} terminated (${signal}) after ${timeoutMs}ms`));
        return;
      }

      let text = '';
      let errorText = '';
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'text' && event.part?.text) {
            text += event.part.text;
          } else if (event.type === 'error' || event.part?.type === 'error') {
            errorText += ` ${JSON.stringify(event.part?.message || event.message || event.part || event)}`;
          }
        } catch { /* ignore non-JSON output lines */ }
      }

      if (text.trim()) {
        finish(resolve, text.trim());
      } else if (errorText.trim()) {
        finish(reject, new Error(`${modelRef} errored: ${errorText.trim().slice(0, 300)}`));
      } else {
        finish(reject, new Error(`${modelRef} exited with code ${code} and returned no text`));
      }
    });
  });
}

/**
 * Extracts a JSON value (object or array) from raw model text, tolerating
 * markdown fences and surrounding prose.
 */
function extractJSON(text) {
  const cleaned = String(text).replace(/```json\s*/gi, '```').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through to bracket scan */ }

  const candidates = [];
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = cleaned.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) { candidates.push(cleaned.slice(start, i + 1)); break; }
      }
    }
  }
  for (const raw of candidates.sort((a, b) => b.length - a.length)) {
    try { return JSON.parse(raw); } catch { /* try next */ }
  }
  throw new Error('Model response contained no parseable JSON');
}

/**
 * Main public API: run a prompt across the free-model fallback chain until one
 * produces valid JSON for the requested task.
 *
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.model]      Preferred model ref ("provider/model")
 * @param {string} [options.task]       'metadata' (fast/creative) or 'reasoning'
 * @param {number} [options.timeoutMs]
 * @param {boolean} [options.expectArray] Request expects a JSON array (e.g. queries)
 * @returns {Promise<{ result: any, usedModel: string }>}
 */
async function generateJSON(prompt, options = {}) {
  const {
    model,
    task = 'metadata',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    totalBudgetMs = CHAIN_BUDGET_MS,
    expectArray = false
  } = options;
  const chain = await buildChain(model, task);
  const deadline = Date.now() + totalBudgetMs;

  let lastError = null;
  for (const modelRef of chain) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) {
      lastError = lastError || new Error('AI chain budget exhausted');
      break;
    }
    try {
      const perModelTimeout = Math.min(timeoutMs, remaining);
      console.log(`[AIClient] 🧠 Task=${task} → trying ${modelRef}`);
      const text = await runOpenCode(modelRef, prompt, perModelTimeout);
      const parsed = extractJSON(text);
      if (expectArray) {
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('Response is not a non-empty JSON array');
        }
      } else if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
        throw new Error('Response is not a JSON object');
      }
      reportSuccess(modelRef);
      return { result: parsed, usedModel: modelRef };
    } catch (err) {
      lastError = err;
      reportFailure(modelRef, err);
    }
  }

  throw new Error(`All OpenCode free models failed. Last error: ${lastError ? lastError.message : 'unknown'}`);
}

/**
 * Lists currently known free models with health status (for the UI).
 */
async function listFreeModels(taskTier = 'metadata') {
  const chain = await buildChain(null, taskTier);
  return chain.map((ref) => {
    const record = health.get(ref);
    return {
      id: ref,
      healthy: !isUnhealthy(ref),
      failCount: record ? record.failCount : 0,
      lastError: record ? record.lastError : null,
      cooldownUntil: record ? record.cooldownUntil : null
    };
  });
}

/**
 * Maps legacy Gemini-only model names (still present in old configs/histories)
 * onto sensible defaults of this client.
 */
function normalizeModelName(name) {
  if (!name) return 'opencode/glm-5.3-flash-free';
  const clean = name.trim();
  if (clean.includes('-free')) return clean; // already an OpenCode ref
  if (clean.includes('pro')) return 'opencode/glm-5.3-flash-free'; // deep reasoning runs on flagship too; chain handles it
  return 'opencode/glm-5.3-flash-free';
}

module.exports = {
  generateJSON,
  extractJSON,
  listFreeModels,
  normalizeModelName,
  discoverFreeModels
};
