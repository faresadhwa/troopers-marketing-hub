module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const topics = [];

  // ── Google Trends RSS (SG + MY) ─────────────────────────────────────────────
  for (const geo of ['SG', 'MY']) {
    try {
      const r = await fetch(
        `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`,
        { headers: { 'User-Agent': 'TROOPERS-Marketing-Hub/1.0' } }
      );
      const xml = await r.text();

      // Extract only titles inside <item> blocks (skip channel-level <title>)
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items) {
        const m = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        if (m && m[1].trim()) topics.push(m[1].trim());
      }
    } catch (_) {
      // skip this source silently
    }
  }

  // ── Reddit public JSON API (no auth needed) ──────────────────────────────────
  for (const sub of ['singapore', 'malaysia', 'careerguidance']) {
    try {
      const r = await fetch(
        `https://www.reddit.com/r/${sub}/top.json?limit=5&t=day`,
        { headers: { 'User-Agent': 'TROOPERS-Marketing-Hub/1.0' } }
      );
      const json = await r.json();
      const posts = json?.data?.children || [];
      for (const post of posts) {
        if (post?.data?.title) topics.push(post.data.title);
      }
    } catch (_) {
      // skip this source silently
    }
  }

  // Deduplicate and filter out empty/very short entries
  const unique = [...new Set(topics)].filter(t => t && t.length > 3);

  return res.status(200).json({ topics: unique, count: unique.length });
};
