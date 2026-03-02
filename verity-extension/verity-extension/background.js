// Verity Background Service Worker
// Handles domain lookup, redirect chain analysis, and AI scoring via Groq

// ── Domain Age via RDAP ──────────────────────────────────────────────────────
async function getDomainAge(domain) {
  try {
    const cleanDomain = domain.replace('www.', '').split('/')[0];
    const res = await fetch(`https://rdap.org/domain/${cleanDomain}`);
    if (!res.ok) return null;
    const data = await res.json();

    const events = data.events || [];
    const registration = events.find(e => e.eventAction === 'registration');
    if (!registration) return null;

    const regDate = new Date(registration.eventDate);
    const ageYears = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return {
      registeredDate: regDate.toISOString().split('T')[0],
      ageYears: Math.round(ageYears * 10) / 10
    };
  } catch {
    return null;
  }
}

// ── Redirect Chain Analysis ──────────────────────────────────────────────────
async function analyzeRedirects(url) {
  const chain = [url];
  let current = url;

  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(4000)
      });

      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next || next === current) break;
        chain.push(next);
        current = next;
      } else {
        break;
      }
    }
  } catch {
    // Network errors fine — return what we have
  }

  return {
    chain,
    hopCount: chain.length - 1,
    finalUrl: chain[chain.length - 1],
    crossesDomains: [...new Set(chain.map(u => { try { return new URL(u).hostname } catch { return u } }))].length > 1
  };
}

// ── AI Credibility Scoring via Groq (free) ───────────────────────────────────
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
- Domain Age: ${domainAge ? `${domainAge.ageYears} years (registered ${domainAge.registeredDate})` : 'Unknown (could not lookup)'}
- Redirect Hops: ${redirects.hopCount} (${redirects.crossesDomains ? 'crosses multiple domains' : 'same domain'})
- Final Destination: ${redirects.finalUrl}

Respond ONLY with valid JSON, no markdown, no backticks, no explanation:
{
  "score": <0-100 integer, higher = more trustworthy>,
  "verdict": "<one of: TRUSTWORTHY | CAUTION | RISKY | SUSPICIOUS>",
  "verdictColor": "<one of: green | yellow | orange | red>",
  "topSignals": [
    {"label": "<signal name>", "value": "<brief value>", "flag": "<positive|neutral|negative>"},
    {"label": "<signal name>", "value": "<brief value>", "flag": "<positive|neutral|negative>"},
    {"label": "<signal name>", "value": "<brief value>", "flag": "<positive|neutral|negative>"}
  ],
  "summary": "<2 sentence plain-English explanation of the score>",
  "topRisk": "<single biggest risk or null if trustworthy>",
  "relevanceToVideo": "<brief note on whether sponsor matches video topic>"
}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: 'You are Verity, a sponsor link trust analyzer. Always respond with valid JSON only — no markdown, no backticks, no extra text.'
        },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq API error ${res.status}: ${err?.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq');

  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── Main Analysis Handler ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ANALYZE_LINK') {
    (async () => {
      try {
        const { url, videoContext, apiKey } = msg;
        const domain = new URL(url).hostname.replace('www.', '');

        const [domainAge, redirects] = await Promise.all([
          getDomainAge(domain),
          analyzeRedirects(url)
        ]);

        const linkData = { url, domain, domainAge, redirects };
        const aiResult = await scoreWithAI(linkData, videoContext, apiKey);

        sendResponse({
          success: true,
          result: { ...aiResult, domainAge, redirects, url }
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
