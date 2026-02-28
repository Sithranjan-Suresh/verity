// Verity Popup Script

const VERITY_KEY = 'verity_page_data';
const API_KEY_STORAGE = 'verity_api_key';
const HISTORY_KEY = 'verity_history';
const MAX_HISTORY = 5;

// ── State Machine ─────────────────────────────────────────────────────────────
const states = ['no-yt', 'setup', 'picker', 'loading', 'results', 'error'];
function showState(name) {
  states.forEach(s => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle('active', s === name);
  });
}

let selectedLink = null;
let pageData = null;
let lastResult = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('youtube.com/watch')) {
    showState('no-yt');
    return;
  }

  const stored = await chrome.storage.local.get(API_KEY_STORAGE);
  if (!stored[API_KEY_STORAGE]) {
    showState('setup');
    return;
  }

  const data = await chrome.storage.local.get(VERITY_KEY);
  pageData = data[VERITY_KEY];

  if (!pageData) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 1500));
    const data2 = await chrome.storage.local.get(VERITY_KEY);
    pageData = data2[VERITY_KEY];
  }

  showPicker();
}

// ── API Key Setup ─────────────────────────────────────────────────────────────
document.getElementById('save-key-btn').addEventListener('click', async () => {
  const key = document.getElementById('api-key-input').value.trim();
  if (key.length < 20) {
    document.getElementById('api-key-input').style.borderColor = 'var(--red)';
    return;
  }
  await chrome.storage.local.set({ [API_KEY_STORAGE]: key });
  init();
});
document.getElementById('api-key-input').addEventListener('input', e => { e.target.style.borderColor = ''; });

// ── History ───────────────────────────────────────────────────────────────────
async function saveToHistory(result) {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const history = stored[HISTORY_KEY] || [];
  const entry = {
    url: result.url,
    domain: (() => { try { return new URL(result.url).hostname.replace('www.', '') } catch { return result.url } })(),
    score: result.score,
    verdict: result.verdict,
    verdictColor: result.verdictColor,
    videoTitle: pageData?.title || 'Unknown',
    checkedAt: Date.now()
  };
  // Remove duplicate if same URL already in history
  const filtered = history.filter(h => h.url !== entry.url);
  const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: updated });
  renderHistory(updated);
}

async function loadHistory() {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  renderHistory(stored[HISTORY_KEY] || []);
}

function renderHistory(history) {
  const wrap = document.getElementById('history-wrap');
  const section = document.getElementById('history-section');
  if (!history.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  wrap.innerHTML = '';

  const colorMap = { green: '#22d48f', yellow: '#f5c542', orange: '#ff8c42', red: '#ff4d6d' };

  history.forEach(entry => {
    const color = colorMap[entry.verdictColor] || '#7c6dfa';
    const timeAgo = formatTimeAgo(entry.checkedAt);
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-score" style="color:${color};border-color:${color}44">${entry.score}</div>
      <div class="history-info">
        <div class="history-domain">${entry.domain}</div>
        <div class="history-meta">${timeAgo} · ${entry.verdict}</div>
      </div>
    `;
    item.addEventListener('click', () => {
      // Pre-select this link if it's in the current page's links
      if (pageData?.links?.includes(entry.url)) {
        selectedLink = entry.url;
        document.querySelectorAll('.link-item').forEach(el => {
          el.classList.toggle('selected', el.querySelector('.link-text')?.title === entry.url);
        });
        document.querySelector('.link-item.selected .link-dot')?.style;
      }
    });
    wrap.appendChild(item);
  });
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Link Picker ───────────────────────────────────────────────────────────────
function showPicker() {
  const links = pageData?.links || [];
  document.getElementById('video-title-preview').textContent = pageData?.title || 'This video';
  const list = document.getElementById('link-list');
  list.innerHTML = '';

  if (links.length === 0) {
    document.getElementById('no-links-msg').style.display = 'block';
    document.getElementById('analyze-btn').disabled = true;
  } else {
    document.getElementById('no-links-msg').style.display = 'none';
    document.getElementById('analyze-btn').disabled = false;
    links.forEach((url, i) => {
      const item = document.createElement('div');
      item.className = 'link-item' + (i === 0 ? ' selected' : '');
      item.innerHTML = `<div class="link-dot"></div><div class="link-text" title="${url}">${url}</div>`;
      item.addEventListener('click', () => {
        document.querySelectorAll('.link-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedLink = url;
      });
      list.appendChild(item);
      if (i === 0) selectedLink = url;
    });
  }

  loadHistory();
  showState('picker');
}

// ── Domain Age via RDAP ───────────────────────────────────────────────────────
async function getDomainAge(domain) {
  try {
    const cleanDomain = domain.replace('www.', '').split('/')[0];
    const res = await fetch(`https://rdap.org/domain/${cleanDomain}`);
    if (!res.ok) return null;
    const data = await res.json();
    const registration = (data.events || []).find(e => e.eventAction === 'registration');
    if (!registration) return null;
    const regDate = new Date(registration.eventDate);
    const ageYears = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return { registeredDate: regDate.toISOString().split('T')[0], ageYears: Math.round(ageYears * 10) / 10 };
  } catch { return null; }
}

// ── Redirect Chain ────────────────────────────────────────────────────────────
async function analyzeRedirects(url) {
  const chain = [url];
  let current = url;
  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(current, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(4000) });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next || next === current) break;
        chain.push(next); current = next;
      } else break;
    }
  } catch {}
  return {
    chain, hopCount: chain.length - 1, finalUrl: chain[chain.length - 1],
    crossesDomains: [...new Set(chain.map(u => { try { return new URL(u).hostname } catch { return u } }))].length > 1
  };
}

// ── Groq AI Scoring ───────────────────────────────────────────────────────────
async function scoreWithAI(linkData, videoContext, apiKey) {
  const { url, domainAge, redirects } = linkData;
  const domain = (() => { try { return new URL(url).hostname.replace('www.', '') } catch { return url } })();

  const prompt = `You are Verity, a sponsor link trust analyzer for YouTube. Analyze this sponsor link and return a JSON credibility report.

VIDEO CONTEXT:
- Title: ${videoContext.title}
- Channel: ${videoContext.channel}

SPONSOR LINK DATA:
- URL: ${url}
- Domain: ${domain}
- Domain Age: ${domainAge ? `${domainAge.ageYears} years (registered ${domainAge.registeredDate})` : 'Unknown'}
- Redirect Hops: ${redirects.hopCount} (${redirects.crossesDomains ? 'crosses multiple domains' : 'same domain'})
- Final Destination: ${redirects.finalUrl}

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "score": <0-100 integer>,
  "verdict": "<TRUSTWORTHY | CAUTION | RISKY | SUSPICIOUS>",
  "verdictColor": "<green | yellow | orange | red>",
  "topSignals": [
    {"label": "<n>", "value": "<brief>", "flag": "<positive|neutral|negative>"},
    {"label": "<n>", "value": "<brief>", "flag": "<positive|neutral|negative>"},
    {"label": "<n>", "value": "<brief>", "flag": "<positive|neutral|negative>"}
  ],
  "summary": "<2 sentence plain-English explanation>",
  "topRisk": "<biggest risk or null>",
  "relevanceToVideo": "<does sponsor match video topic?>",
  "mismatch": <true if sponsor topic clearly doesn't match channel content, false otherwise>
}

Score ranges to follow strictly:
- 75-100 = TRUSTWORTHY (verdictColor: green)
- 50-74  = CAUTION     (verdictColor: yellow)
- 25-49  = RISKY       (verdictColor: orange)
- 0-24   = SUSPICIOUS  (verdictColor: red)`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: 'system', content: 'You are Verity, a sponsor link trust analyzer. Always respond with valid JSON only — no markdown, no backticks, no extra text.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq error ${res.status}: ${err?.error?.message || 'unknown'}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ── Analysis ──────────────────────────────────────────────────────────────────
document.getElementById('analyze-btn').addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (!selectedLink) return;
  showState('loading');
  animateLoadingSteps();

  const stored = await chrome.storage.local.get(API_KEY_STORAGE);
  const apiKey = stored[API_KEY_STORAGE];
  const videoContext = { title: pageData?.title || 'Unknown', channel: pageData?.channel || 'Unknown' };

  try {
    const url = selectedLink;
    const domain = (() => { try { return new URL(url).hostname.replace('www.', '') } catch { return url } })();
    const [domainAge, redirects] = await Promise.all([getDomainAge(domain), analyzeRedirects(url)]);
    const aiResult = await scoreWithAI({ url, domainAge, redirects }, videoContext, apiKey);
    lastResult = { ...aiResult, domainAge, redirects, url };
    await saveToHistory(lastResult);
    renderResults(lastResult);
  } catch (err) {
    showError('Analysis failed.', err.message);
  }
}

function animateLoadingSteps() {
  const steps = ['step-domain', 'step-redirect', 'step-ai'];
  const delays = [0, 1200, 2400];
  steps.forEach((id, i) => {
    const el = document.getElementById(id);
    el.className = 'loading-step';
    setTimeout(() => { el.classList.add('active'); el.querySelector('.step-icon').textContent = '⟳'; }, delays[i]);
    setTimeout(() => { el.classList.remove('active'); el.classList.add('done'); el.querySelector('.step-icon').textContent = '✓'; }, delays[i] + 1100);
  });
}

// ── Render Results ────────────────────────────────────────────────────────────
function renderResults(result) {
  const { score, verdict, verdictColor, topSignals, summary, topRisk, relevanceToVideo, mismatch, domainAge, redirects, url } = result;
  const colorMap = { green: '#22d48f', yellow: '#f5c542', orange: '#ff8c42', red: '#ff4d6d' };
  const color = colorMap[verdictColor] || '#7c6dfa';

  const ring = document.getElementById('score-ring');
  ring.style.stroke = color;
  setTimeout(() => { ring.style.strokeDashoffset = 188 - (score / 100) * 188; }, 80);
  document.getElementById('score-number').textContent = score;
  document.getElementById('score-number').style.color = color;

  const badge = document.getElementById('verdict-badge');
  badge.style.color = color;
  badge.style.borderColor = color + '44';
  badge.style.backgroundColor = color + '11';
  document.getElementById('verdict-dot').style.backgroundColor = color;
  document.getElementById('verdict-text').textContent = verdict;

  let domain = url;
  try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
  document.getElementById('result-domain').textContent = domain;
  document.getElementById('result-summary').textContent = summary;

  // ── Mismatch badge ──
  const mismatchBadge = document.getElementById('mismatch-badge');
  if (mismatch) {
    mismatchBadge.style.display = 'flex';
    mismatchBadge.textContent = `⚠ Sponsor doesn't match this channel's content`;
  } else {
    mismatchBadge.style.display = 'none';
  }

  // ── Signals ──
  const signalsList = document.getElementById('signals-list');
  signalsList.innerHTML = '';
  ;(topSignals || []).forEach((sig, i) => {
    const row = document.createElement('div');
    row.className = `signal-row ${sig.flag}`;
    row.style.animationDelay = `${i * 80}ms`;
    row.innerHTML = `<span class="signal-label">${sig.label}</span><span class="signal-value ${sig.flag}">${sig.value}</span>`;
    signalsList.appendChild(row);
  });

  // Domain age and redirect hops come from AI topSignals — no manual duplication needed

  if (topRisk) {
    document.getElementById('risk-card').style.display = 'block';
    document.getElementById('risk-text').textContent = topRisk;
  } else {
    document.getElementById('risk-card').style.display = 'none';
  }

  document.getElementById('relevance-text').textContent = relevanceToVideo || 'No data.';

  if (redirects?.chain?.length > 1) {
    document.getElementById('chain-label').style.display = 'block';
    const chainWrap = document.getElementById('chain-wrap');
    chainWrap.innerHTML = '';
    redirects.chain.forEach((u, i) => {
      const row = document.createElement('div');
      row.className = 'chain-row';
      row.innerHTML = `<span class="arrow">${i === 0 ? '○' : '→'}</span><span class="chain-url" title="${u}">${u}</span>`;
      chainWrap.appendChild(row);
    });
  } else {
    document.getElementById('chain-label').style.display = 'none';
  }

  showState('results');
}

// ── Screenshot / Share ────────────────────────────────────────────────────────
document.getElementById('share-btn').addEventListener('click', async () => {
  if (!lastResult) return;

  const colorMap = { green: '#22d48f', yellow: '#f5c542', orange: '#ff8c42', red: '#ff4d6d' };
  const color = colorMap[lastResult.verdictColor] || '#7c6dfa';
  let domain = lastResult.url;
  try { domain = new URL(lastResult.url).hostname.replace('www.', ''); } catch {}

  // Build a canvas card
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, 640, 360);

  // Accent top bar
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 640, 4);

  // Left color strip
  ctx.fillStyle = color + '33';
  ctx.fillRect(0, 0, 6, 360);

  // Score circle
  ctx.beginPath();
  ctx.arc(100, 160, 60, 0, Math.PI * 2);
  ctx.strokeStyle = '#1a1a24';
  ctx.lineWidth = 8;
  ctx.stroke();

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (lastResult.score / 100) * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(100, 160, 60, startAngle, endAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(lastResult.score, 100, 168);

  ctx.fillStyle = '#6b6b80';
  ctx.font = '12px sans-serif';
  ctx.fillText('/100', 100, 186);

  // Verdict
  ctx.fillStyle = color;
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(lastResult.verdict, 185, 120);

  // Domain
  ctx.fillStyle = '#f0f0f5';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(domain, 185, 150);

  // Summary (word wrap)
  ctx.fillStyle = '#8888a0';
  ctx.font = '13px sans-serif';
  const words = (lastResult.summary || '').split(' ');
  let line = ''; let y = 180;
  words.forEach(word => {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > 420 && line) {
      ctx.fillText(line, 185, y); line = word + ' '; y += 20;
    } else { line = test; }
  });
  ctx.fillText(line, 185, y);

  // Mismatch badge
  if (lastResult.mismatch) {
    ctx.fillStyle = '#ff8c4222';
    roundRect(ctx, 185, y + 16, 400, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#ff8c42';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText("⚠  Sponsor doesn't match this channel's content", 197, y + 34);
  }

  // Verity branding
  ctx.fillStyle = '#7c6dfa';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Verity', 620, 340);
  ctx.fillStyle = '#6b6b80';
  ctx.font = '11px sans-serif';
  ctx.fillText('Trust Layer for YouTube Sponsors', 620, 356);

  // Video title
  ctx.fillStyle = '#44445a';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  const titleText = (pageData?.title || '').slice(0, 70) + ((pageData?.title || '').length > 70 ? '…' : '');
  ctx.fillText(titleText, 20, 340);

  // Copy to clipboard
  canvas.toBlob(async blob => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      const btn = document.getElementById('share-btn');
      btn.textContent = '✓ Copied!';
      btn.style.background = '#22d48f22';
      btn.style.color = '#22d48f';
      btn.style.borderColor = '#22d48f44';
      setTimeout(() => {
        btn.textContent = '📋 Copy Result Card';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 2000);
    } catch {
      // Fallback: download as PNG
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `verity-${domain}.png`;
      a.click();
    }
  });
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Back + Error ──────────────────────────────────────────────────────────────
document.getElementById('back-btn').addEventListener('click', showPicker);
document.getElementById('error-back-btn').addEventListener('click', showPicker);

function showError(msg, detail = '') {
  document.getElementById('error-msg').textContent = msg;
  document.getElementById('error-detail').textContent = detail;
  showState('error');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
