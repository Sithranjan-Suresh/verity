// Verity Content Script — runs on YouTube watch pages
// Extracts sponsor links from the video description and sends to popup

const VERITY_KEY = 'verity_page_data';

function extractLinks(text) {
  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;
  const matches = text.match(urlRegex) || [];
  // Deduplicate and filter out YouTube's own links
  const filtered = [...new Set(matches)].filter(url => {
    const domain = new URL(url).hostname.replace('www.', '');
    return !['youtube.com', 'youtu.be', 'google.com', 'bit.ly'].some(d => domain.includes(d));
  });
  return filtered;
}

function getVideoMeta() {
  const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.innerText 
    || document.querySelector('h1.title')?.innerText 
    || document.title.replace(' - YouTube', '');
  
  const channel = document.querySelector('ytd-channel-name yt-formatted-string a')?.innerText 
    || document.querySelector('#channel-name a')?.innerText 
    || 'Unknown Channel';

  return { title, channel };
}

function getDescription() {
  // Try expanded description first
  const descEl = document.querySelector('ytd-text-inline-expander #description-inline-expander')
    || document.querySelector('#description ytd-text-inline-expander')
    || document.querySelector('#description')
    || document.querySelector('ytd-expander#description');
  
  return descEl?.innerText || document.querySelector('#meta #description')?.innerText || '';
}

function scrapePageData() {
  const description = getDescription();
  const links = extractLinks(description);
  const { title, channel } = getVideoMeta();
  
  return {
    title,
    channel,
    description: description.slice(0, 2000), // cap size
    links,
    url: window.location.href,
    scrapedAt: Date.now()
  };
}

// Store data in chrome storage so popup can read it
function storeData() {
  const data = scrapePageData();
  chrome.storage.local.set({ [VERITY_KEY]: data });
}

// Run on load and when description might expand
storeData();

// YouTube is a SPA — re-scrape when navigation happens
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(storeData, 2000); // wait for description to render
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// Also re-scrape if description expands (click "more")
document.addEventListener('click', (e) => {
  if (e.target.closest('ytd-text-inline-expander') || e.target.closest('#expand')) {
    setTimeout(storeData, 500);
  }
});
