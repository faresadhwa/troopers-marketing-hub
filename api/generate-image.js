module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, width = 1024, height = 1024 } = req.body;
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

    const imageRes = await fetch(url, {
      headers: { 'User-Agent': 'TroopersMarketingHub/1.0' }
    });

    if (!imageRes.ok) {
      return res.status(500).json({ error: `Image service returned ${imageRes.status}. Try a different prompt.` });
    }

    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(500).json({ error: 'Image service did not return an image. Try rephrasing your prompt.' });
    }

    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return res.status(200).json({ image: base64, mimeType: contentType });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
