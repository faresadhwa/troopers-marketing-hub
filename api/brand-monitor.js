module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keyword, region = 'both' } = req.query;
  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  const kw = keyword.trim();
  const kwLower = kw.toLowerCase();
  const results = [];

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async function fetchTimeout(url, opts = {}, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      return r;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  function decodeHtmlEntities(str) {
    return (str || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .trim();
  }

  // Parse RSS/Atom items — returns all items (no keyword filter)
  function parseRssItems(xml) {
    const items = [];
    const blocks = xml.match(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/g) || [];
    for (const block of blocks) {
      const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const linkRss    = block.match(/<link>([^<\s]+)<\/link>/);
      const linkAtom   = block.match(/<link[^>]+href="([^"]+)"/);
      const guidMatch  = block.match(/<guid[^>]*>([^<]+)<\/guid>/);

      const title = decodeHtmlEntities(titleMatch?.[1]);
      const url   = (linkRss?.[1] || linkAtom?.[1] || guidMatch?.[1] || '').trim();

      if (title && title.length > 5) items.push({ title, url });
    }
    return items;
  }

  // Fetch Google News RSS (keyword already in query — no extra filter needed)
  async function fetchGoogleNews(searchQuery, geo, label) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en&gl=${geo}&ceid=${geo}:en`;
      const r = await fetchTimeout(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,text/xml,*/*' }
      });
      if (!r.ok) return;
      const xml = await r.text();
      const items = parseRssItems(xml).slice(0, 5);
      if (items.length > 0) results.push({ source: label, region: geo, items });
    } catch (_) {}
  }

  // Fetch a generic RSS feed and filter titles by keyword
  async function fetchRssFeed(sourceName, sourceRegion, feedUrl, maxItems = 3) {
    try {
      const r = await fetchTimeout(feedUrl, {
        headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,text/xml,*/*' }
      });
      if (!r.ok) return;
      const xml = await r.text();
      const all = parseRssItems(xml);
      const items = all.filter(i => i.title.toLowerCase().includes(kwLower)).slice(0, maxItems);
      if (items.length > 0) results.push({ source: sourceName, region: sourceRegion, items });
    } catch (_) {}
  }

  // Fetch Reddit JSON (subreddit search)
  async function fetchReddit(subreddit, regionLabel) {
    try {
      const r = await fetchTimeout(
        `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(kw)}&restrict_sr=1&sort=new&limit=5`,
        { headers: { 'User-Agent': 'TroopersMarketingHub/1.0' } }
      );
      if (!r.ok) return;
      const json = await r.json();
      const posts = json?.data?.children || [];
      const items = posts
        .filter(p => p.data?.title)
        .map(p => ({ title: p.data.title, url: `https://reddit.com${p.data.permalink}` }))
        .slice(0, 3);
      if (items.length > 0) results.push({ source: `Reddit r/${subreddit}`, region: regionLabel, items });
    } catch (_) {}
  }

  const promises = [];

  // ── MALAYSIA SOURCES ─────────────────────────────────────────────────────────
  if (region === 'MY' || region === 'both') {
    // Google News keyword search — most reliable MY coverage
    promises.push(fetchGoogleNews(`${kw} malaysia`, 'MY', 'Google News Malaysia'));
    promises.push(fetchGoogleNews(`${kw} site:thestar.com.my OR site:freemalaysiatoday.com OR site:malaymail.com OR site:malaysiakini.com`, 'MY', 'MY Media (Google)'));

    // MY English news RSS
    promises.push(fetchRssFeed('Free Malaysia Today', 'MY', 'https://www.freemalaysiatoday.com/feed/'));
    promises.push(fetchRssFeed('Malay Mail', 'MY', 'https://www.malaymail.com/feed'));
    promises.push(fetchRssFeed('The Star', 'MY', 'https://www.thestar.com.my/rss/News/Nation'));
    promises.push(fetchRssFeed('Bernama', 'MY', 'https://bernama.com/rss/index.php'));
    promises.push(fetchRssFeed('Malaysia Gazette', 'MY', 'https://malaysiagazette.com/feed/'));
    promises.push(fetchRssFeed('The Malaysian Reserve', 'MY', 'https://themalaysianreserve.com/feed/'));

    // MY Malay news RSS
    promises.push(fetchRssFeed('Berita Harian', 'MY', 'https://www.bharian.com.my/rss'));
    promises.push(fetchRssFeed('Harian Metro', 'MY', 'https://www.hmetro.com.my/rss'));
    promises.push(fetchRssFeed('Utusan Malaysia', 'MY', 'https://www.utusan.com.my/feed/'));

    // MY Chinese news RSS
    promises.push(fetchRssFeed('Sin Chew Daily', 'MY', 'https://www.sinchew.com.my/feed/'));
    promises.push(fetchRssFeed('China Press', 'MY', 'https://www.chinapress.com.my/feed/'));

    // MY Tech/Lifestyle RSS
    promises.push(fetchRssFeed('SoyaCincau', 'MY', 'https://soyacincau.com/feed/'));
    promises.push(fetchRssFeed('Says.com', 'MY', 'https://says.com/my/feed'));

    // MY Community
    promises.push(fetchReddit('malaysia', 'MY'));
    promises.push(fetchReddit('kualalumpur', 'MY'));
  }

  // ── SINGAPORE SOURCES ─────────────────────────────────────────────────────────
  if (region === 'SG' || region === 'both') {
    // Google News keyword search
    promises.push(fetchGoogleNews(`${kw} singapore`, 'SG', 'Google News Singapore'));
    promises.push(fetchGoogleNews(`${kw} site:straitstimes.com OR site:channelnewsasia.com OR site:todayonline.com OR site:mothership.sg`, 'SG', 'SG Media (Google)'));

    // SG English news RSS
    promises.push(fetchRssFeed('Channel NewsAsia', 'SG', 'https://www.channelnewsasia.com/rss/news'));
    promises.push(fetchRssFeed('Mothership.sg', 'SG', 'https://mothership.sg/feed/'));
    promises.push(fetchRssFeed('Today Online', 'SG', 'https://www.todayonline.com/feed'));
    promises.push(fetchRssFeed('The Independent SG', 'SG', 'https://theindependent.sg/feed/'));
    promises.push(fetchRssFeed('AsiaOne', 'SG', 'https://www.asiaone.com/rss.xml'));

    // SG Malay/Chinese
    promises.push(fetchRssFeed('Berita Mediacorp', 'SG', 'https://beritaharian.sg/feed'));
    promises.push(fetchRssFeed('Lianhe Zaobao', 'SG', 'https://www.zaobao.com.sg/rss/singapore'));

    // SG Community
    promises.push(fetchReddit('singapore', 'SG'));
    promises.push(fetchReddit('asksingapore', 'SG'));
  }

  // ── REGIONAL (BOTH MY + SG) ───────────────────────────────────────────────────
  promises.push(fetchRssFeed('Vulcan Post', 'MY/SG', 'https://vulcanpost.com/feed/'));
  promises.push(fetchRssFeed('Marketing Interactive', 'MY/SG', 'https://www.marketing-interactive.com/feed'));
  promises.push(fetchRssFeed('Tech in Asia', 'MY/SG', 'https://www.techinasia.com/feed'));

  await Promise.all(promises);

  const total = results.reduce((sum, r) => sum + r.items.length, 0);

  return res.status(200).json({
    keyword: kw,
    region,
    results,
    total,
    timestamp: new Date().toISOString()
  });
};
