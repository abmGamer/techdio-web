module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method Not Allowed' });
    return;
  }
  const isConfigured = !!(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
  res.json({
    status: 'OK',
    message: 'Techdio backend is running',
    timestamp: new Date().toISOString(),
    configured: isConfigured,
    version: '1.0.0'
  });
};
