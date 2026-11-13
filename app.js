'use strict';
/* Nodewise — IoT Deployment Advisor (v6)
   Chat UI for any OpenAI-compatible chat-completions API, with push-to-talk voice. */

const $ = (id) => document.getElementById(id);

/* ───────────────────────── Constants & persistent storage ───────────────────────── */
const CONN_KEY = 'nodewise.connection.v1';   // { endpoint, model, key }
const PREF_KEY = 'nodewise.prefs.v1';        // { voiceOutput }
const DEFAULT_CONN = { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', key: '' };
const MAX_HISTORY = 24;            // messages sent to the model per request
const IDLE_TIMEOUT_MS = 60000;     // abort if the server sends nothing for this long
const SPEECH_CHUNK_MAX = 220;      // Chrome cuts off long utterances, so speak in small pieces

const store = {
  read(key) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } }
};

let conn = { ...DEFAULT_CONN, ...pickConn(store.read(CONN_KEY)) };
let prefs = { voiceOutput: true, ...store.read(PREF_KEY) };

function pickConn(o) {
  const out = {};
  for (const k of ['endpoint', 'model', 'key']) if (typeof o[k] === 'string' && o[k]) out[k] = o[k];
  return out;
}
function saveConn() { return store.write(CONN_KEY, conn); }
function savePrefs() { store.write(PREF_KEY, prefs); }
// Ask the browser not to evict our storage under pressure (best effort, ignored where unsupported).
try { navigator.storage?.persist?.(); } catch { /* ignore */ }

/* ───────────────────────── Small helpers ───────────────────────── */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showToast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
const LABELS = {
  distance: { short: 'Short range', medium: 'Medium range', long: 'Long range' },
  power: { mains: 'Mains powered', battery: 'Battery powered', solar: 'Solar / energy harvesting' },
  dataRate: { low: 'Small readings every few minutes', medium: 'Frequent updates / control', high: 'High-volume data / audio / video' },
  environment: { indoor: 'Indoor / office', industrial: 'Industrial / noisy', outdoor: 'Outdoor / exposed' },
  budget: { low: 'Low / student prototype', medium: 'Medium / reliable prototype', high: 'High / production-oriented' },
  coverage: { yes: 'Wi-Fi / internet available', limited: 'Limited or unreliable', no: 'No direct internet' }
};
const label = (key, val) => LABELS[key]?.[val] || val;
const hasKey = () => !!conn.key;

/* ───────────────────────── Connection status UI ───────────────────────── */
function refreshConnectionUI() {
  const connected = hasKey();
  const dot = $('conn-dot'), title = $('conn-title'), sub = $('conn-sub'), hint = $('setup-hint');
  if (dot) dot.classList.toggle('off', !connected);
  if (title) title.textContent = connected ? 'AI connected' : 'Not connected';
  if (sub) sub.textContent = connected ? `${conn.model} · key saved on this device` : 'Add your API key in AI settings';
  if (hint) hint.innerHTML = connected
    ? `Connected to <b>${escapeHtml(conn.model)}</b>. Fill in the profile and start the conversation.`
    : 'First, add an API endpoint, model, and key in <b>AI settings</b>. You only need to do this once.';
  const status = $('chat-status');
  if (status && !chatBusy) status.textContent = connected ? `Ready · ${conn.model}` : 'Connect an LLM in AI settings to start chatting.';
}

/* ───────────────────────── Settings modal ───────────────────────── */
let settingsOpener = null;
function normalizeEndpoint(raw) {
  let url;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
  // Friendly fix: a bare ".../v1" base URL becomes ".../v1/chat/completions".
  if (/\/v\d+\/?$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/?$/, '/chat/completions');
  return url.toString();
}
function closeSettings() {
  const modal = $('settings-modal');
  if (!modal) return;
  modal.remove();
  document.removeEventListener('keydown', onSettingsKey, true);
  if (settingsOpener && document.contains(settingsOpener)) settingsOpener.focus();
  settingsOpener = null;
}
function onSettingsKey(e) { if (e.key === 'Escape') { e.preventDefault(); closeSettings(); } }
function saveSettings() {
  const endpoint = normalizeEndpoint($('llm-endpoint').value);
  const model = $('llm-model').value.trim();
  const key = $('llm-key').value.trim();
  if (!endpoint) { showToast('Endpoint must be a valid https:// URL'); $('llm-endpoint').focus(); return; }
  if (!model) { showToast('Enter a model name'); $('llm-model').focus(); return; }
  if (!key) { showToast('Enter your API key'); $('llm-key').focus(); return; }
  conn = { endpoint, model, key };
  quirks = {};                                  // new connection → forget learned provider quirks
  const persisted = saveConn();
  closeSettings();
  refreshConnectionUI();
  showToast(persisted ? 'Connection saved on this device' : 'Connected for this tab only (browser storage is unavailable)');
  $('chat-input')?.focus();
}
function forgetKey() {
  store.remove(CONN_KEY);
  conn = { ...DEFAULT_CONN };
  quirks = {};
  closeSettings();
  refreshConnectionUI();
  showToast('Saved API key removed from this device');
}
function openSettings() {
  if ($('settings-modal')) return;
  settingsOpener = document.activeElement;
  const modal = document.createElement('div');
  modal.id = 'settings-modal'; modal.className = 'modal-backdrop';
  modal.innerHTML = `<section class="settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <button class="modal-close" id="close-settings" type="button" aria-label="Close">×</button>
    <div class="section-kicker">CONNECTION</div><h2 id="settings-title">Connect your LLM</h2>
    <p>Use any OpenAI-compatible chat-completions API. Your settings are saved in this browser on this device, so you only enter them once.</p>
    <label class="field-label" for="llm-endpoint">API endpoint</label>
    <input class="text-input" id="llm-endpoint" type="url" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false">
    <label class="field-label" for="llm-model">Model name</label>
    <input class="text-input" id="llm-model" autocapitalize="off" autocomplete="off" spellcheck="false">
    <label class="field-label" for="llm-key">API key</label>
    <input class="text-input" id="llm-key" type="password" placeholder="Paste your API key" autocapitalize="off" autocomplete="off" spellcheck="false">
    <label class="check-row"><input type="checkbox" id="llm-show"> Show key</label>
    <p class="security-note"><b>Security:</b> the key is stored unencrypted in this browser's local storage and sent straight from your browser to the provider. Anyone who can use this browser profile could read it. Use a key with a low spending limit, and don't save it on a shared device. For a public app, use a backend proxy instead.</p>
    <div class="modal-actions"><button class="secondary-button danger" id="forget-key" type="button">Remove saved key</button><span class="spacer"></span><button class="secondary-button" id="cancel-settings" type="button">Cancel</button><button class="primary-button" id="save-settings" type="button">Save connection</button></div>
  </section>`;
  document.body.appendChild(modal);
  $('llm-endpoint').value = conn.endpoint; $('llm-model').value = conn.model; $('llm-key').value = conn.key;
  $('forget-key').hidden = !store.read(CONN_KEY).key;
  $('close-settings').onclick = $('cancel-settings').onclick = closeSettings;
  $('save-settings').onclick = saveSettings;
  $('forget-key').onclick = forgetKey;
  $('llm-show').onchange = (e) => { $('llm-key').type = e.target.checked ? 'text' : 'password'; };
  modal.addEventListener('click', (e) => { if (e.target === modal) closeSettings(); });
  modal.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); saveSettings(); } });
  document.addEventListener('keydown', onSettingsKey, true);
  (hasKey() ? $('llm-model') : $('llm-key')).focus();
}
$('llm-settings')?.addEventListener('click', openSettings);

/* ───────────────────────── Markdown (small, XSS-safe renderer) ───────────────────────── */
const SUP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻','+':'⁺','n':'ⁿ' };
const SUB = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
const TEX = { times:'×', cdot:'·', approx:'≈', leq:'≤', le:'≤', geq:'≥', ge:'≥', neq:'≠', pm:'±', rightarrow:'→', to:'→', Rightarrow:'⇒', leftarrow:'←', mu:'µ', Omega:'Ω', omega:'ω', Delta:'Δ', delta:'δ', pi:'π', alpha:'α', beta:'β', lambda:'λ', theta:'θ', sigma:'σ', tau:'τ', eta:'η', degree:'°', circ:'°', infty:'∞' };
const mapChars = (str, map) => ([...str].every((c) => map[c]) ? [...str].map((c) => map[c]).join('') : null);
// Models sometimes answer with LaTeX ($...$, \( \), \frac, \times). Turn it into plain readable text.
function texToText(t) {
  return t
    .replace(/\\(?:text|mathrm|mathbf|textbf|operatorname|mathit)\{([^{}]*)\}/g, '$1')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\^\{?([0-9+\-n]+)\}?/g, (m, x) => mapChars(x, SUP) ?? `^${x}`)
    .replace(/_\{?([0-9]+)\}?/g, (m, x) => mapChars(x, SUB) ?? `_${x}`)
    .replace(/\\([A-Za-z]+)/g, (m, w) => TEX[w] ?? '')
    .replace(/\\[,;: !]/g, ' ').replace(/[{}]/g, '').replace(/\s{2,}/g, ' ').trim();
}
function cleanMath(s) {
  return s.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]*\\[A-Za-z][^$\n]*)\$/g, (m, a, b, c, d) => texToText(a ?? b ?? c ?? d));
}
function inlineMd(text, streaming) {
  const keep = []; const hold = (h) => `\u0000${keep.push(h) - 1}\u0000`;
  const A = (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">`;
  let s = escapeHtml(text.replace(/`([^`\n]+)`/g, (m, c) => hold(`<code>${escapeHtml(c)}</code>`)))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => hold(A(u)) + t + hold('</a>'))
    .replace(/(^|[\s(])(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g, (m, p, u) => p + hold(A(u)) + u + hold('</a>'))
    .replace(/(^|[^A-Za-z0-9*\\])\*\*\*\s*(\S[\s\S]*?)\s*\*\*\*/g, '$1<strong><em>$2</em></strong>')
    .replace(/(^|[^A-Za-z0-9*\\])\*\*\s*(\S[\s\S]*?)\s*\*\*/g, '$1<strong>$2</strong>')
    .replace(/(^|[^A-Za-z0-9_\\])__(\S[\s\S]*?)__(?![A-Za-z0-9_])/g, '$1<strong>$2</strong>')
    .replace(/(^|[^A-Za-z0-9*\\])\*([^\s*](?:[^*\n]*?[^\s*])?)\*(?![A-Za-z0-9*])/g, '$1<em>$2</em>')
    .replace(/(^|[^A-Za-z0-9_\\])_([^\s_](?:[^_\n]*?[^\s_])?)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>')
    .replace(/~~(\S(?:[^~\n]*?\S)?)~~/g, '<del>$1</del>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\\([*_~#])/g, '$1')
    .replace(/\*\*+/g, '');                       // never show stray / still-streaming bold markers
  if (streaming) s = s.replace(/(^|\s)\*(?=\S)/g, '$1').replace(/[*_~]+$/, '');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[i]);
}
const LIST_RE = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TBL_ROW = /^\s*\|.*\|\s*$/;
const TBL_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
function buildList(items, md) {
  let html = ''; const stack = [];
  const open = (it) => { html += it.tag === 'ol' && it.start > 1 ? `<ol start="${it.start}">` : `<${it.tag}>`; stack.push({ indent: it.indent, tag: it.tag }); };
  for (const it of items) {
    if (!stack.length) open(it);
    else if (it.indent > stack[stack.length - 1].indent) open(it);   // deeper → nested list inside the open <li>
    else {
      while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
      html += '</li>';
      const top = stack[stack.length - 1];
      if (top.tag !== it.tag) { html += `</${top.tag}>`; stack.pop(); open(it); }
    }
    html += `<li>${md(it.text)}`;
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}
function renderMarkdown(src, streaming = false) {
  const out = [];
  const md = (t) => inlineMd(t, streaming);
  src.replace(/\r\n?/g, '\n').split('```').forEach((chunk, i) => {
    if (i % 2) {                                            // fenced code (an unclosed fence also lands here while streaming)
      out.push(`<pre><code>${escapeHtml(chunk.replace(/^[^\n]*\n/, '').replace(/\n$/, ''))}</code></pre>`);
      return;
    }
    const lines = cleanMath(chunk).split('\n');
    let para = [], quote = [], items = [];
    const flush = () => {
      if (para.length) { out.push(`<p>${md(para.join('\n')).replace(/\n/g, '<br>')}</p>`); para = []; }
      if (quote.length) { out.push(`<blockquote>${md(quote.join('\n')).replace(/\n/g, '<br>')}</blockquote>`); quote = []; }
      if (items.length) { out.push(buildList(items, md)); items = []; }
    };
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n]; let m;
      if (!line.trim()) { if (!items.length) flush(); continue; }          // blank lines inside a list don't end it
      if (items.length && /^\s{2,}\S/.test(line) && !LIST_RE.test(line)) { items[items.length - 1].text += ' ' + line.trim(); continue; }
      if (HR_RE.test(line)) { flush(); out.push('<hr>'); }
      else if ((m = line.match(LIST_RE))) {
        if (!items.length) flush();
        items.push({ indent: m[1].replace(/\t/g, '    ').length, tag: /\d/.test(m[2]) ? 'ol' : 'ul', start: parseInt(m[2], 10) || 1, text: m[3] });
      }
      else if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); out.push(`<${m[1].length <= 2 ? 'h3' : 'h4'}>${md(m[2])}</${m[1].length <= 2 ? 'h3' : 'h4'}>`); }
      else if ((m = line.match(/^\s*\*\*([^*\n]+?)\*\*:?\s*$/))) { flush(); out.push(`<h4>${md(m[1])}</h4>`); }   // a line that is only bold = a title
      else if ((m = line.match(/^\s*>\s?(.*)$/))) { if (!quote.length) flush(); quote.push(m[1]); }
      else if (TBL_ROW.test(line) && TBL_SEP.test(lines[n + 1] || '')) {
        flush();
        const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => md(c.trim()));
        const head = cells(line); const rows = []; n += 2;
        while (n < lines.length && TBL_ROW.test(lines[n])) rows.push(cells(lines[n++]));
        n--;
        out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      }
      else { if (!para.length) flush(); para.push(line.trim()); }
    }
    flush();
  });
  return out.join('');
}

/* ───────────────────────── Speech output (incremental, sentence by sentence) ───────────────────────── */
let currentSpeaker = null;
function speechSupported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }
function stopSpeaking() {
  if (currentSpeaker) currentSpeaker.cancelled = true;
  currentSpeaker = null;
  if (speechSupported()) window.speechSynthesis.cancel();
}
function cleanForSpeech(text) {
  return cleanMath(text)
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*\)/g, '$1').replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '').replace(/~~|^\s*>\s?/gm, '').replace(/_{1,2}/g, ' ')
    .replace(/`+/g, '').replace(/\*+/g, '').replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-•]\s+/gm, '').replace(/^\s*\|?\s*:?-{2,}[-:|\s]*$/gm, '').replace(/\|/g, ', ')
    .replace(/\s+/g, ' ').trim();
}
function splitLong(text) {
  const pieces = [];
  while (text.length > SPEECH_CHUNK_MAX) {
    let cut = Math.max(text.lastIndexOf(', ', SPEECH_CHUNK_MAX), text.lastIndexOf('; ', SPEECH_CHUNK_MAX), text.lastIndexOf(' ', SPEECH_CHUNK_MAX));
    if (cut < 40) cut = SPEECH_CHUNK_MAX;
    pieces.push(text.slice(0, cut + 1).trim()); text = text.slice(cut + 1);
  }
  if (text.trim()) pieces.push(text.trim());
  return pieces;
}
function createSpeaker() {
  stopSpeaking();
  if (!prefs.voiceOutput || !speechSupported()) return null;
  const sp = { raw: '', inCode: false, cancelled: false };
  const say = (chunk) => {
    let visible = '';
    chunk.split('```').forEach((part, i) => { if (i) sp.inCode = !sp.inCode; if (!sp.inCode) visible += part; });
    for (const piece of splitLong(cleanForSpeech(visible))) {
      if (!/[\p{L}\p{N}]/u.test(piece)) continue;
      const u = new SpeechSynthesisUtterance(piece);
      u.lang = navigator.language || 'en-IN'; u.rate = 1;
      window.speechSynthesis.speak(u);
    }
  };
  sp.push = (delta) => {
    if (sp.cancelled) return;
    sp.raw += delta;
    let cut = -1, m; const re = /[.!?।]+["')\]]*\s|\n{2,}/g;
    while ((m = re.exec(sp.raw))) cut = m.index + m[0].length;
    if (cut > 0) { say(sp.raw.slice(0, cut)); sp.raw = sp.raw.slice(cut); }
  };
  sp.finish = () => { if (!sp.cancelled && sp.raw.trim()) say(sp.raw); sp.raw = ''; };
  currentSpeaker = sp;
  return sp;
}

/* ───────────────────────── Chat state ───────────────────────── */
let chatMessages = [];
let systemPrompt = '';
let chatBusy = false;
let convoId = 0;                 // bumps on reset so late responses can't leak into a new conversation
let abortCtl = null;
let abortReason = '';
let quirks = {};                 // per-provider learnings (e.g. "no temperature", "no streaming")

function addBubble(role, text = '') {
  const transcript = $('chat-transcript');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = `<div class="bubble-label">${role === 'user' ? 'YOU' : 'NODEWISE'}</div><div class="bubble-text"></div>`;
  const body = bubble.querySelector('.bubble-text');
  if (role === 'user') body.innerHTML = escapeHtml(text).replace(/\n/g, '<br>'); else if (text) body.innerHTML = renderMarkdown(text);
  transcript.appendChild(bubble); transcript.scrollTop = transcript.scrollHeight;
  return bubble;
}
function setBusy(busy) {
  chatBusy = busy;
  const send = $('send-chat');
  if (!send) return;
  send.classList.toggle('stop', busy);
  send.textContent = busy ? '■' : '➤';
  send.setAttribute('aria-label', busy ? 'Stop generating' : 'Send message');
  $('chat-transcript')?.setAttribute('aria-busy', String(busy));
}
function resetConversation() {
  convoId++;
  abortReason = 'reset'; abortCtl?.abort();
  stopSpeaking();
  if (isListening) stopVoiceInput(false);
  chatMessages = [];
  setBusy(false);
}

/* ───────────────────────── Network: streaming chat completions ───────────────────────── */
async function describeHttpError(response) {
  let msg = '';
  try {
    const text = await response.text();
    try { const j = JSON.parse(text); msg = j?.error?.message || j?.message || j?.error || ''; if (typeof msg !== 'string') msg = JSON.stringify(msg); } catch { msg = text.slice(0, 200); }
  } catch { /* ignore */ }
  const hint = { 401: 'The API key was rejected.', 403: 'Access denied for this key or model.', 404: 'Endpoint or model not found.', 429: 'Rate limit or quota reached; check credits.' }[response.status] || '';
  const err = new Error([msg || `Request failed (${response.status}).`, hint].filter(Boolean).join(' '));
  err.status = response.status; err.raw = msg;
  return err;
}
async function readSSE(response, onDelta) {
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let buf = '';
  const handle = (line) => {
    if (!line.startsWith('data:')) return false;
    const payload = line.slice(5).trim();
    if (!payload) return false;
    if (payload === '[DONE]') return true;
    let j; try { j = JSON.parse(payload); } catch { return false; }
    if (j.error) throw new Error(j.error.message || 'The provider reported an error mid-stream.');
    const c = j.choices?.[0]; const d = c?.delta?.content ?? c?.text;
    if (typeof d === 'string' && d) onDelta(d);
    return false;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) if (handle(l.replace(/\r$/, ''))) { reader.cancel().catch(() => {}); return; }
  }
  if (buf) handle(buf.replace(/\r$/, ''));
}
async function requestCompletion(history, onDelta) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = abortCtl; let timer;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { abortReason = 'timeout'; ctl.abort(); }, IDLE_TIMEOUT_MS); };
    arm();
    try {
      const body = { model: conn.model, messages: [{ role: 'system', content: systemPrompt }, ...history] };
      if (!quirks.noTemperature) body.temperature = 0.4;
      if (!quirks.noStream) body.stream = true;
      const response = await fetch(conn.endpoint, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.key}` },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const err = await describeHttpError(response);
        // Self-heal on providers/models that reject optional parameters, then retry.
        if (err.status === 400 && /temperature/i.test(err.raw) && !quirks.noTemperature) { quirks.noTemperature = true; continue; }
        if (err.status === 400 && /stream/i.test(err.raw) && !quirks.noStream) { quirks.noStream = true; continue; }
        throw err;
      }
      if ((response.headers.get('content-type') || '').includes('text/event-stream') && response.body) {
        let got = false;
        await readSSE(response, (d) => { got = true; arm(); onDelta(d); });
        if (!got) throw new Error('The model returned no text.');
      } else {
        const data = await response.json();
        const answer = data?.choices?.[0]?.message?.content;
        if (!answer) throw new Error('The model returned no text. Check that the endpoint supports chat completions.');
        onDelta(answer);
      }
      return;
    } finally { clearTimeout(timer); }
  }
  throw new Error('The provider rejected the request.');
}

async function sendChatMessage() {
  if (chatBusy) return;
  const input = $('chat-input'); const text = input?.value.trim();
  if (!text) return;
  if (!hasKey()) { openSettings(); showToast('Add your LLM API key first'); return; }

  const myConvo = convoId;
  input.value = '';
  chatMessages.push({ role: 'user', content: text }); addBubble('user', text);
  const bubble = addBubble('assistant'); bubble.classList.add('pending');
  const body = bubble.querySelector('.bubble-text'); body.textContent = 'Thinking…';
  setBusy(true); $('chat-status').textContent = 'Waiting for the model…';
  abortCtl = new AbortController(); abortReason = '';

  const transcript = $('chat-transcript');
  const speaker = createSpeaker();
  let answer = '', frame = 0;
  const paint = (done) => {
    frame = 0;
    const stick = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 90;
    body.innerHTML = renderMarkdown(answer, done !== true);
    if (stick) transcript.scrollTop = transcript.scrollHeight;
  };
  try {
    await requestCompletion(chatMessages.slice(-MAX_HISTORY), (delta) => {
      if (myConvo !== convoId) return;
      if (!answer) { bubble.classList.remove('pending'); $('chat-status').textContent = 'Receiving…'; }
      answer += delta; speaker?.push(delta);
      if (!frame) frame = requestAnimationFrame(paint);
    });
    if (myConvo !== convoId) return;
    cancelAnimationFrame(frame); paint(true);
    chatMessages.push({ role: 'assistant', content: answer });
    speaker?.finish();
    $('chat-status').textContent = `Connected · ${conn.model}`;
  } catch (err) {
    if (myConvo !== convoId) return;                       // conversation was reset; nothing to show
    cancelAnimationFrame(frame);
    const stopped = err.name === 'AbortError' && abortReason !== 'timeout';
    if (answer) {                                          // keep whatever streamed in before the stop/failure
      paint(true); chatMessages.push({ role: 'assistant', content: answer }); speaker?.finish();
      $('chat-status').textContent = stopped ? 'Stopped.' : `Interrupted: ${err.message}`;
    } else {
      chatMessages.pop();                                  // don't leave a dangling user turn in the history
      speaker && (speaker.cancelled = true);
      if (stopped) { bubble.previousElementSibling?.remove(); bubble.remove(); $('chat-status').textContent = 'Stopped.'; input.value = text; }
      else {
        const timedOut = abortReason === 'timeout';
        const network = err instanceof TypeError;
        const detail = timedOut ? 'The request timed out.' : network ? 'Network or CORS error: the provider may not allow direct browser requests, or you are offline.' : err.message;
        body.textContent = `I couldn't reach the LLM: ${detail}\n\nOpen AI settings and verify your endpoint, model, API key, and account credits. Your message was put back in the box so you can retry.`;
        bubble.classList.remove('pending', 'assistant'); bubble.classList.add('error');
        $('chat-status').textContent = 'Connection error'; input.value = text;
      }
    }
  } finally {
    if (myConvo === convoId) { setBusy(false); abortCtl = null; if (document.activeElement === $('send-chat')) input.focus(); }  // keep the keyboard state; never pop it up after a voice send
  }
}

/* ───────────────────────── Voice input (push-to-talk) ───────────────────────── */
let speechRecognition = null;
let isListening = false;

function setupVoiceControls() {
  const mic = $('voice-mic'), output = $('voice-output'), stop = $('voice-stop');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    mic.disabled = true;
    $('voice-hint').textContent = 'Speech recognition is not available in this browser. Try Chrome on Android.';
  } else {
    mic.onclick = () => (isListening ? stopVoiceInput(true) : startVoiceInput(SR));
  }
  const paintOutput = () => {
    output.textContent = prefs.voiceOutput ? '🔊 Voice replies: on' : '🔇 Voice replies: off';
    output.setAttribute('aria-pressed', String(prefs.voiceOutput));
  };
  paintOutput();
  output.onclick = () => { prefs.voiceOutput = !prefs.voiceOutput; savePrefs(); paintOutput(); if (!prefs.voiceOutput) stopSpeaking(); };
  stop.onclick = stopSpeaking;
}
function resetVoiceButton() {
  const mic = $('voice-mic'); if (!mic) return;
  mic.textContent = '🎙 Start talking'; mic.classList.remove('listening');
}
function startVoiceInput(SR) {
  if (chatBusy) { showToast('Wait for Nodewise to finish replying'); return; }
  stopSpeaking();
  const input = $('chat-input');
  input.value = '';
  const rec = new SR();
  speechRecognition = rec;
  rec.lang = navigator.language || 'en-IN'; rec.continuous = false; rec.interimResults = true;
  let finalText = '', interim = '', failure = '', discard = false;
  rec.discard = () => { discard = true; };
  rec.onstart = () => {
    isListening = true;
    const mic = $('voice-mic'); mic.textContent = '■ Stop & send'; mic.classList.add('listening');
    $('voice-hint').textContent = 'Listening… pause or tap Stop & send when done.';
    input.placeholder = 'Listening to your question…';
  };
  rec.onresult = (event) => {
    interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const phrase = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += phrase + ' '; else interim += phrase;
    }
    input.value = (finalText + interim).trim();
  };
  rec.onerror = (event) => {
    failure = event.error;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') $('voice-hint').textContent = 'Microphone permission was blocked. Allow it in your browser’s site settings.';
    else if (event.error === 'no-speech') $('voice-hint').textContent = 'No speech detected. Tap the microphone to try again.';
    else if (event.error !== 'aborted') $('voice-hint').textContent = `Voice input error: ${event.error}. You can type instead.`;
  };
  rec.onend = () => {
    if (speechRecognition === rec) { speechRecognition = null; isListening = false; }
    resetVoiceButton();
    const el = $('chat-input'); if (!el) return;
    el.placeholder = 'Ask a follow-up about your IoT project…';
    if (discard) return;
    const text = el.value.trim();
    if (text && !failure) { $('voice-hint').textContent = 'Sent. Tap the microphone to talk again.'; sendChatMessage(); }
    else if (!failure) $('voice-hint').textContent = 'No speech detected. Tap the microphone to try again.';
  };
  try { rec.start(); }
  catch { speechRecognition = null; isListening = false; resetVoiceButton(); $('voice-hint').textContent = 'Could not start the microphone. Check browser permission.'; }
}
function stopVoiceInput(send = true) {
  const rec = speechRecognition;
  if (!rec) return;
  if (!send) rec.discard?.();
  try { send ? rec.stop() : rec.abort(); } catch { /* already stopped */ }
  if (!send) { isListening = false; speechRecognition = null; resetVoiceButton(); }
}

/* ───────────────────────── Conversation view ───────────────────────── */
function renderChat(v) {
  const projectName = v.projectName.trim() || 'IoT deployment';
  systemPrompt = `You are Nodewise, a helpful IoT systems advisor for ECE students and builders. Be conversational, technically accurate, practical, and explicit about assumptions. Help with sensors, MCUs, connectivity (Wi-Fi, BLE, Zigbee, LoRaWAN, cellular, Ethernet, CAN where relevant), power budgeting, architecture, deployment, debugging, and security. Ask concise clarifying questions when necessary. Never invent datasheet specifications or claim a design is validated. Prefer actionable steps and explain trade-offs. OUTPUT FORMAT (important): replies are read on small phone screens and may be read aloud, so write clean, plain text. Never use asterisks or underscores for emphasis (no **bold**, no *italic*), no LaTeX or dollar-sign math, no horizontal rules and no emojis. Use short paragraphs. Use \"- \" for bullets and \"1.\" for numbered steps. For a section title use a short line starting with \"## \". Use a table only to compare three or more options, with at most 4 columns. Put code, commands and configuration in fenced code blocks. Write units and symbols in plain text, for example 3.3 V, 10 mA, 868 MHz.\n\nPROJECT CONTEXT:\nThe user is planning an IoT/ECE project. Use this profile as context, but allow them to change direction or ask about any IoT use case.\nProject: ${projectName}\nGoal: ${v.goal}\nDistance: ${label('distance', v.distance)}\nPower: ${label('power', v.power)}\nData frequency: ${label('dataRate', v.dataRate)}\nEnvironment: ${label('environment', v.environment)}\nBudget: ${label('budget', v.budget)}\nInternet availability: ${label('coverage', v.coverage)}\n\nGive practical, uncertainty-aware engineering guidance. Ask clarifying questions when needed, compare alternatives, mention safety/security/regulatory considerations, and never claim untested coverage or exact battery life.`;
  resetConversation();
  $('results').innerHTML = `<div class="chat-header"><div><div class="section-kicker">NODEWISE AI / CONVERSATION</div><h2 class="result-title">${escapeHtml(projectName)}</h2><p class="result-subtitle">Your project profile is attached as context. Ask anything, then continue with follow-ups.</p></div><button class="secondary-button" id="edit-context" type="button">Edit profile</button></div><div class="context-strip"><span class="context-dot"></span> Project context attached · ${escapeHtml(label('power', v.power))} · ${escapeHtml(label('distance', v.distance))}</div><div class="chat-transcript" id="chat-transcript" aria-live="polite"><div class="chat-bubble assistant"><div class="bubble-label">NODEWISE</div><div class="bubble-text">Hi! I'm your IoT deployment assistant. I have your project profile as context. What would you like to figure out first? You can ask me to compare connectivity options, choose sensors, estimate power needs, design the architecture, or troubleshoot an issue.</div></div></div><div class="chat-compose"><textarea id="chat-input" class="text-input chat-textarea" rows="2" placeholder="Ask a follow-up about your IoT project…" aria-label="Message the IoT advisor"></textarea><button class="send-button" id="send-chat" type="button" aria-label="Send message">➤</button></div><div class="voice-controls"><button class="voice-button primary" id="voice-mic" type="button" aria-label="Start voice input">🎙 Start talking</button><button class="voice-button" id="voice-output" type="button" aria-pressed="true">🔊 Voice replies: on</button><button class="voice-button" id="voice-stop" type="button">■ Stop audio</button><span class="voice-hint" id="voice-hint" aria-live="polite">Tap the microphone and speak. It sends when you pause or tap again.</span></div><div class="chat-footer"><span id="chat-status"></span><button class="text-button" id="clear-chat" type="button">New conversation</button></div>`;
  $('results').classList.add('chat-active');
  $('edit-context').onclick = () => { $('goal').focus(); $('advisor-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('send-chat').onclick = () => (chatBusy ? (abortReason = 'user', abortCtl?.abort()) : sendChatMessage());
  setupVoiceControls();
  $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChatMessage(); } });
  $('clear-chat').onclick = () => {
    resetConversation();
    $('chat-transcript').innerHTML = '<div class="chat-bubble assistant"><div class="bubble-label">NODEWISE</div><div class="bubble-text">New conversation started. What would you like to explore?</div></div>';
    $('chat-status').textContent = 'Conversation cleared.';
  };
  refreshConnectionUI();
  $('chat-input').focus();
}

/* ───────────────────────── Page wiring ───────────────────────── */
const form = $('advisor-form');
document.querySelectorAll('[data-example]').forEach((button) => {
  button.addEventListener('click', () => { $('goal').value = button.dataset.example; $('goal').focus(); });
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = { projectName: $('project-name').value, goal: $('goal').value.trim(), distance: $('distance').value, power: $('power').value, dataRate: $('data-rate').value, environment: $('environment').value, budget: $('budget').value, coverage: $('coverage').value };
  if (!v.goal) { $('goal').focus(); return; }
  renderChat(v);
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
refreshConnectionUI();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
