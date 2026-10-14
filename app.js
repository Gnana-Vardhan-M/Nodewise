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
function renderPlan(p, v) {
  $('results').innerHTML = `<div class="result-header"><div><div class="section-kicker">02 / YOUR DEPLOYMENT PLAN</div><h2 class="result-title">${escapeHtml(p.projectName)}</h2><div class="result-subtitle">A first-pass plan based on your project profile.</div></div><span class="confidence-pill">STARTING POINT</span></div>
    <section class="result-section"><h3><span class="num">01</span> Connectivity recommendation</h3><div class="recommendation-card"><div class="tech-name">${escapeHtml(p.conn.primary)}</div><p class="tech-reason">${escapeHtml(p.conn.reason)}</p><div class="chips">${p.conn.chips.map(c=>`<span class="chip">${escapeHtml(c)}</span>`).join('')}</div></div></section>
    <section class="result-section"><h3><span class="num">02</span> Suggested architecture</h3><div class="architecture">${p.architecture.map((a,i)=>`${i?'<span class="arch-arrow">→</span>':''}<div class="arch-node">${escapeHtml(a)}</div>`).join('')}</div></section>
    <section class="result-section"><h3><span class="num">03</span> Sensors & power</h3>${renderList([...p.sensorAdvice,...p.powerAdvice])}</section>
    <section class="result-section"><h3><span class="num">04</span> Prototype roadmap</h3>${renderList(p.roadmap)}</section>
    <section class="result-section"><h3><span class="num">05</span> Risks to validate</h3>${renderList(p.risks,true)}</section>
    <section class="result-section"><h3><span class="num">AI</span> Prompt-engineering brief</h3><p class="result-subtitle" style="margin-bottom:10px">Use this context with an LLM for a deeper design review. This demo generates recommendations locally and does not call an AI API.</p><div class="prompt-box" id="prompt-output">${escapeHtml(p.prompt)}</div><div class="result-actions"><button class="secondary-button" id="copy-prompt">Copy prompt ↗</button><button class="secondary-button" id="copy-plan">Copy plan ↗</button></div></section>`;
  $('copy-prompt').addEventListener('click', () => copyText(p.prompt, 'Prompt copied'));
  $('copy-plan').addEventListener('click', () => copyText(planAsText(p), 'Plan copied'));
}
function planAsText(p) { return `${p.projectName}\n\nCONNECTIVITY\n${p.conn.primary}\n${p.conn.reason}\n\nARCHITECTURE\n${p.architecture.join(' -> ')}\n\nSENSORS\n${p.sensorAdvice.join('\n')}\n\nPOWER\n${p.powerAdvice.join('\n')}\n\nROADMAP\n${p.roadmap.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nRISKS\n${p.risks.map(x=>'- '+x).join('\n')}`; }
async function copyText(text, message) { try { await navigator.clipboard.writeText(text); showToast(message); } catch { const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();showToast(message); } }
function showToast(message) { const old=document.querySelector('.toast'); if(old) old.remove(); const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2300); }
form.addEventListener('submit', e => { e.preventDefault(); const v={projectName:$('project-name').value,goal:$('goal').value.trim(),distance:$('distance').value,power:$('power').value,dataRate:$('data-rate').value,environment:$('environment').value,budget:$('budget').value,coverage:$('coverage').value}; if(!v.goal){$('goal').focus();return;} latestPlan=buildPlan(v);renderPlan(latestPlan,v);$('results').scrollIntoView({behavior:'smooth',block:'start'}); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {})); }
