module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const topics = [];
  const errors = [];

  const browserUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async function fetchTimeout(url, opts = {}, ms = 7000) {
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

  // Parse titles from RSS/Atom XML <item> or <entry> blocks
  function parseRssTitles(xml) {
    const results = [];
    const blocks = xml.match(/<(?:item|entry)>[\s\S]*?<\/(?:item|entry)>/g) || [];
    for (const block of blocks) {
      const m = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      if (m && m[1].trim()) results.push(m[1].trim());
    }
    return results;
  }

  // ── Google News RSS — public, no auth, works from servers ───────────────────
  // Searching for relevant SG/MY marketing, hiring, and social media topics
  const newsQueries = [
    { q: 'singapore+hiring+jobs+parttime', geo: 'SG', label: 'News SG Jobs' },
    { q: 'malaysia+hiring+jobs+kerja', geo: 'MY', label: 'News MY Jobs' },
    { q: 'singapore+social+media+viral+trending', geo: 'SG', label: 'News SG Trends' },
    { q: 'malaysia+viral+trending+tiktok', geo: 'MY', label: 'News MY Trends' },
  ];

  for (const { q, geo, label } of newsQueries) {
    try {
      const r = await fetchTimeout(
        `https://news.google.com/rss/search?q=${q}&hl=en&gl=${geo}&ceid=${geo}:en`,
        { headers: { 'User-Agent': browserUA, 'Accept': 'application/rss+xml,text/xml,*/*' } }
      );
      if (!r.ok) {
        errors.push(`${label}: HTTP ${r.status}`);
        continue;
      }
      const xml = await r.text();
      const titles = parseRssTitles(xml).slice(0, 5); // top 5 per query
      if (titles.length === 0) {
        errors.push(`${label}: no results`);
      } else {
        topics.push(...titles);
      }
    } catch (err) {
      errors.push(`${label}: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    }
  }

  // ── HackerNews Algolia API — fully open, no auth needed ─────────────────────
  // Search for relevant career/work/marketing topics
  const hnQueries = ['hiring', 'marketing trends', 'social media'];
  for (const query of hnQueries) {
    try {
      const r = await fetchTimeout(
        `https://hn.algolia.com/api/v1/search?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=3`,
        { headers: { 'User-Agent': browserUA } }
      );
      if (!r.ok) {
        errors.push(`HackerNews "${query}": HTTP ${r.status}`);
        continue;
      }
      const json = await r.json();
      const hits = json?.hits || [];
      for (const hit of hits) {
        if (hit?.title) topics.push(hit.title);
      }
    } catch (err) {
      errors.push(`HackerNews: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    }
  }

  const unique = [...new Set(topics)].filter(t => t && t.length > 5);

  return res.status(200).json({
    topics: unique,
    count: unique.length,
    errors: errors.length > 0 ? errors : undefined
  });
};
