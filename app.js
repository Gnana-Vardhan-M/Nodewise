const $ = (id) => document.getElementById(id);
const form = $('advisor-form');
let latestPlan = null;

function chooseConnectivity(v) {
  const {distance, power, dataRate, coverage, budget, environment} = v;
  let primary, reason, chips;
  if (dataRate === 'high') {
    primary = coverage === 'no' ? 'Local Wi-Fi / Ethernet gateway' : 'Wi-Fi 6 or Ethernet';
    reason = 'High-volume data needs a higher-throughput link. Keep heavy processing or video near a powered gateway, then send summaries to the cloud. Long-range low-power radios are not designed for continuous high-volume streams.';
    chips = ['High throughput', 'Gateway recommended', 'Power-hungry'];
  } else if (distance === 'long' && (power === 'battery' || power === 'solar') && dataRate === 'low') {
    primary = 'LoRaWAN';
    reason = 'A strong starting point for small, periodic sensor readings over long distances with low power use. You will need a LoRaWAN gateway or a compatible network service, and should verify coverage and regional frequency rules at the site.';
    chips = ['Long range', 'Low data rate', 'Low power'];
  } else if (distance === 'long' && coverage === 'no') {
    primary = 'Sub-GHz radio / LoRa point-to-point';
    reason = 'For remote sites without internet, a local radio link can carry telemetry to a nearby collector. If data must reach the internet, plan a gateway with backhaul such as cellular or a site network.';
    chips = ['Remote sites', 'Gateway/backhaul needed', 'Site test required'];
  } else if (distance === 'short' && (power === 'battery' || dataRate === 'low')) {
    primary = 'Bluetooth Low Energy (BLE)';
    reason = 'BLE is well suited to nearby battery-powered sensors that send small updates to a phone or gateway. It is not a direct internet connection by itself; add a gateway if remote monitoring is required.';
    chips = ['Short range', 'Very low power', 'Phone/gateway friendly'];
  } else if (coverage === 'yes' && distance !== 'long') {
    primary = 'Wi-Fi';
    reason = 'Wi-Fi is convenient where dependable coverage and power are available, especially for frequent updates or direct IP connectivity. For battery nodes, consider sleeping between transmissions or using a lower-power protocol.';
    chips = ['IP connectivity', 'Easy prototyping', 'Higher power draw'];
  } else if (distance === 'long' && coverage === 'yes' && power === 'mains') {
    primary = 'Wi-Fi or cellular gateway';
    reason = 'Use Wi-Fi where local infrastructure reaches the device; otherwise evaluate cellular at the site. For multiple remote low-data sensors, a local LoRaWAN network feeding one internet-connected gateway may reduce endpoint power needs.';
    chips = ['Compare site coverage', 'Gateway option', 'Validate recurring costs'];
  } else {
    primary = 'Sub-GHz / LoRaWAN (evaluate first)';
    reason = 'For moderate-to-long range telemetry with limited internet, evaluate a low-power radio and a gateway. Confirm required data rate, legal frequency band, antenna placement, and coverage before committing.';
    chips = ['Low-data telemetry', 'Coverage test', 'Gateway may be needed'];
  }
  if (environment === 'industrial') reason += ' In industrial environments, also check interference, metal obstructions, grounding, enclosure rating, and whether wired Ethernet/RS-485 is more reliable for critical control.';
  if (budget === 'low') reason += ' For a student prototype, start with development boards and a small bench test before buying deployment-scale hardware.';
  return {primary, reason, chips};
}
function buildPlan(v) {
  const conn = chooseConnectivity(v);
  const powerAdvice = v.power === 'battery'
    ? ['Choose a low-power sensor and radio; measure sleep and transmit current rather than relying only on datasheets.', 'Use deep sleep / duty cycling and send batches of readings when acceptable.', 'Estimate battery life using average current, battery capacity, temperature, and expected transmission frequency.']
    : v.power === 'solar'
    ? ['Estimate daily energy use, including radio bursts and standby current.', 'Size the panel and battery for poor-weather margin and local sunlight.', 'Add battery protection and monitor supply voltage in the prototype.']
    : ['Use a regulated supply sized for peak current, not just average current.', 'Add brownout handling and safe restart behavior.', 'Consider a UPS or backup source if missed readings matter.'];
  const sensorAdvice = /soil|farm|moisture/i.test(v.goal)
    ? ['Start with a capacitive soil-moisture sensor; calibrate it for the actual soil and crop conditions.', 'Compare readings against a trusted reference and test sensor drift over several days.']
    : /temperature|heat|thermal/i.test(v.goal)
    ? ['Select a temperature sensor for the required range, accuracy, and response time.', 'Place it away from heat sources that do not represent the measurement you need.']
    : /air|gas|quality|smoke/i.test(v.goal)
    ? ['Choose a sensor matched to the target gas or air-quality metric; low-cost modules may need calibration and warm-up.', 'Plan periodic calibration and safe handling for any hazardous environment.']
    : ['Choose sensors by measurement range, accuracy, calibration needs, and interface (I²C, SPI, UART, or analog).', 'Test sensor repeatability and drift under real operating conditions.'];
  const architecture = v.coverage === 'yes' && v.distance !== 'long' && v.dataRate !== 'low'
    ? ['Sensor + MCU', conn.primary, 'Cloud / dashboard']
    : ['Sensor + low-power MCU', conn.primary, 'Gateway / backhaul', 'Dashboard / alerts'];
  const risks = [];
  if (v.distance === 'long') risks.push('Measure coverage at the actual installation points; walls, terrain, foliage, and antenna height change results.');
  if (v.coverage !== 'yes') risks.push('Decide how the gateway reaches the internet—or whether local-only storage is enough.');
  if (v.environment === 'outdoor') risks.push('Use an enclosure and connectors rated for rain, dust, UV, and the local temperature range.');
  if (v.environment === 'industrial') risks.push('Test interference and grounding; separate safety-critical control from an unvalidated wireless link.');
  risks.push('Protect device credentials, encrypt links where supported, update firmware safely, and avoid exposing device management ports publicly.');
  const roadmap = ['Build one sensor node and log readings locally first.', 'Add the selected radio link and test packet delivery at the target distance.', 'Add gateway buffering, timestamps, and reconnect behavior for outages.', 'Build a dashboard and alert thresholds; test missing, delayed, and implausible readings.', 'Run a multi-day field test, measure power, and document limitations before scaling.'];
  const projectName = v.projectName.trim() || 'IoT deployment';
  const prompt = `You are an IoT systems engineer advising a student prototype. Give practical, evidence-aware guidance and clearly label assumptions. Do not claim a technology will work without a site test.\n\nPROJECT\nName: ${projectName}\nGoal: ${v.goal}\nDistance: ${label('distance', v.distance)}\nPower: ${label('power', v.power)}\nData frequency: ${label('dataRate', v.dataRate)}\nEnvironment: ${label('environment', v.environment)}\nBudget: ${label('budget', v.budget)}\nInternet availability: ${label('coverage', v.coverage)}\n\nPlease return: (1) recommended connectivity and why, (2) a simple sensor-to-dashboard architecture, (3) hardware categories to investigate without inventing exact prices, (4) power strategy, (5) prototype roadmap, (6) risks and validation tests, and (7) questions that would change the recommendation. Compare at least one alternative and mention relevant regional radio regulations. Avoid unsupported certainty.`;
  return {projectName, conn, powerAdvice, sensorAdvice, architecture, risks, roadmap, prompt};
}
function label(key, val) {
  const maps = {
    distance: {short:'Short range',medium:'Medium range',long:'Long range'},
    power: {mains:'Mains powered',battery:'Battery powered',solar:'Solar / energy harvesting'},
    dataRate: {low:'Small readings every few minutes',medium:'Frequent updates / control',high:'High-volume data / audio / video'},
    environment: {indoor:'Indoor / office',industrial:'Industrial / noisy',outdoor:'Outdoor / exposed'},
    budget: {low:'Low / student prototype',medium:'Medium / reliable prototype',high:'High / production-oriented'},
    coverage: {yes:'Wi-Fi / internet available',limited:'Limited or unreliable',no:'No direct internet'}
  };
  return maps[key][val] || val;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderList(items, warning=false) { return `<ul class="result-list ${warning?'warning-list':''}">${items.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`; }
let chatMessages = [];
let activeContext = '';
let chatBusy = false;
let llmConfig = { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', key: '' };

function getLLMConfig() {
  if ($('llm-key')) return { endpoint: $('llm-endpoint').value.trim(), model: $('llm-model').value.trim(), key: $('llm-key').value.trim() };
  return {...llmConfig};
}
function openSettings() {
  let modal = $('settings-modal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'settings-modal'; modal.className = 'modal-backdrop';
    modal.innerHTML = `<section class="settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button class="modal-close" id="close-settings" aria-label="Close">×</button><div class="section-kicker">CONNECTION</div><h2 id="settings-title">Connect your LLM</h2><p>Use an OpenAI-compatible chat-completions API. Your key stays in this tab's memory and is not saved by Nodewise.</p><label class="field-label" for="llm-endpoint">API endpoint</label><input class="text-input" id="llm-endpoint" value="https://api.openai.com/v1/chat/completions" autocapitalize="off" autocomplete="off"><label class="field-label" for="llm-model">Model name</label><input class="text-input" id="llm-model" value="gpt-4o-mini" autocapitalize="off" autocomplete="off"><label class="field-label" for="llm-key">API key</label><input class="text-input" id="llm-key" type="password" placeholder="Paste your API key" autocomplete="off"><p class="security-note"><b>Security:</b> this static GitHub Pages app sends your key directly from your browser to the provider. Do not use a key with sensitive or high spending limits. For a public production app, use a backend/serverless proxy instead.</p><div class="modal-actions"><button class="secondary-button" id="cancel-settings">Cancel</button><button class="primary-button" id="save-settings">Use this connection</button></div></section>`;
    document.body.appendChild(modal);
    $('close-settings').onclick = $('cancel-settings').onclick = () => modal.remove();
    $('save-settings').onclick = () => { const cfg = getLLMConfig(); if (!cfg.endpoint || !cfg.model || !cfg.key) { showToast('Enter endpoint, model, and API key'); return; } llmConfig = {...cfg}; modal.remove(); showToast('LLM connection configured for this tab'); if ($('chat-input')) $('chat-input').focus(); };
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }
}
$('llm-settings')?.addEventListener('click', openSettings);
function renderPlan(p, v) {
  activeContext = `The user is planning an IoT/ECE project. Use this profile as context, but allow them to change direction or ask about any IoT use case.\nProject: ${p.projectName}\nGoal: ${v.goal}\nDistance: ${label('distance',v.distance)}\nPower: ${label('power',v.power)}\nData frequency: ${label('dataRate',v.dataRate)}\nEnvironment: ${label('environment',v.environment)}\nBudget: ${label('budget',v.budget)}\nInternet availability: ${label('coverage',v.coverage)}\n\nGive practical, uncertainty-aware engineering guidance. Ask clarifying questions when needed, compare alternatives, mention safety/security/regulatory considerations, and never claim untested coverage or exact battery life.`;
  chatMessages = [];
  $('results').innerHTML = `<div class="chat-header"><div><div class="section-kicker">NODEWISE AI / CONVERSATION</div><h2 class="result-title">${escapeHtml(p.projectName)}</h2><p class="result-subtitle">Your project profile is attached as context. Ask anything, then continue with follow-ups.</p></div><button class="secondary-button" id="edit-context">Edit profile</button></div><div class="context-strip"> <span class="context-dot"></span> Project context attached · ${escapeHtml(label('power',v.power))} · ${escapeHtml(label('distance',v.distance))}</div><div class="chat-transcript" id="chat-transcript" aria-live="polite"><div class="chat-bubble assistant"><div class="bubble-label">NODEWISE</div>Hi! I'm your IoT deployment assistant. I have your project profile as context. What would you like to figure out first? You can ask me to compare connectivity options, choose sensors, estimate power needs, design the architecture, or troubleshoot an issue.</div></div><div class="chat-compose"><textarea id="chat-input" class="text-input chat-textarea" rows="2" placeholder="Ask a follow-up about your IoT project…" aria-label="Message the IoT advisor"></textarea><button class="send-button" id="send-chat" aria-label="Send message">➤</button></div><div class="chat-footer"><span id="chat-status">Connect an LLM in AI settings to start chatting.</span><button class="text-button" id="clear-chat">New conversation</button></div>`;
  $('edit-context').onclick = () => { $('goal').focus(); $('advisor-form').scrollIntoView({behavior:'smooth',block:'start'}); };
  $('send-chat').onclick = sendChatMessage;
  $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });
  $('clear-chat').onclick = () => { chatMessages = []; $('chat-transcript').innerHTML = `<div class="chat-bubble assistant"><div class="bubble-label">NODEWISE</div>New conversation started. What would you like to explore?</div>`; $('chat-status').textContent = 'Conversation cleared.'; };
  $('chat-input').focus();
}
function addBubble(role, text) {
  const transcript = $('chat-transcript'); const bubble = document.createElement('div'); bubble.className = `chat-bubble ${role}`;
  const labelText = role === 'user' ? 'YOU' : 'NODEWISE';
  bubble.innerHTML = `<div class="bubble-label">${labelText}</div><div class="bubble-text">${escapeHtml(text).replace(/\n/g,'<br>')}</div>`;
  transcript.appendChild(bubble); transcript.scrollTop = transcript.scrollHeight; return bubble;
}
async function sendChatMessage() {
  if (chatBusy) return;
  const input = $('chat-input'); const text = input?.value.trim(); if (!text) return;
  const cfg = getLLMConfig();
  if (!cfg.key) { openSettings(); showToast('Add your LLM API key first'); return; }
  input.value = ''; chatMessages.push({role:'user',content:text}); addBubble('user',text);
  const pending = addBubble('assistant','Thinking…'); pending.classList.add('pending'); chatBusy = true; $('send-chat').disabled = true; $('chat-status').textContent = 'Waiting for the model…';
  try {
    const response = await fetch(cfg.endpoint, {method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}`},body:JSON.stringify({model:cfg.model, messages:[{role:'system',content:`You are Nodewise, a helpful IoT systems advisor for ECE students and builders. Be conversational, technically accurate, practical, and explicit about assumptions. Help with sensors, MCUs, connectivity (Wi-Fi, BLE, Zigbee, LoRaWAN, cellular, Ethernet, CAN where relevant), power budgeting, architecture, deployment, debugging, and security. Ask concise clarifying questions when necessary. Never invent datasheet specifications or claim a design is validated. Prefer actionable steps and explain trade-offs.\n\nPROJECT CONTEXT:\n${activeContext}`} ,...chatMessages],temperature:0.4})});
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status}). Check endpoint, model, and API key.`);
    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) throw new Error('The model returned no text. Check that the selected endpoint supports chat completions.');
    chatMessages.push({role:'assistant',content:answer}); pending.querySelector('.bubble-text').textContent = answer; pending.classList.remove('pending'); $('chat-status').textContent = `Connected · ${cfg.model}`;
  } catch (err) { pending.querySelector('.bubble-text').textContent = `I couldn't reach the LLM: ${err.message}\n\nOpen AI settings and verify your endpoint, model, API key, account credits, and provider CORS support.`; pending.classList.remove('pending','assistant'); pending.classList.add('error'); $('chat-status').textContent = 'Connection error'; }
  finally { chatBusy = false; $('send-chat').disabled = false; input.focus(); }
}
function planAsText(p) { return `${p.projectName}\n\nCONNECTIVITY\n${p.conn.primary}\n${p.conn.reason}\n\nARCHITECTURE\n${p.architecture.join(' -> ')}\n\nSENSORS\n${p.sensorAdvice.join('\n')}\n\nPOWER\n${p.powerAdvice.join('\n')}\n\nROADMAP\n${p.roadmap.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nRISKS\n${p.risks.map(x=>'- '+x).join('\n')}`; }
async function copyText(text, message) { try { await navigator.clipboard.writeText(text); showToast(message); } catch { const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();showToast(message); } }
function showToast(message) { const old=document.querySelector('.toast'); if(old) old.remove(); const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2300); }
document.querySelectorAll('[data-example]').forEach(button => { button.addEventListener('click', () => { $('goal').value = button.dataset.example; $('goal').focus(); }); });
form.addEventListener('submit', e => { e.preventDefault(); const v={projectName:$('project-name').value,goal:$('goal').value.trim(),distance:$('distance').value,power:$('power').value,dataRate:$('data-rate').value,environment:$('environment').value,budget:$('budget').value,coverage:$('coverage').value}; if(!v.goal){$('goal').focus();return;} latestPlan=buildPlan(v);renderPlan(latestPlan,v);$('results').scrollIntoView({behavior:'smooth',block:'start'}); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {})); }
