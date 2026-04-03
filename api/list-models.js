module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );
    const data = await response.json();

    const imageModels = (data.models || []).filter(m =>
      m.supportedGenerationMethods?.some(method =>
        method === 'generateContent' || method === 'predict'
      ) && (
        m.name?.toLowerCase().includes('image') ||
        m.name?.toLowerCase().includes('imagen') ||
        m.description?.toLowerCase().includes('image')
      )
    );

    return res.status(200).json({
      imageRelatedModels: imageModels.map(m => ({
        name: m.name,
        displayName: m.displayName,
        description: m.description,
        methods: m.supportedGenerationMethods
      })),
      allModels: (data.models || []).map(m => m.name)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
