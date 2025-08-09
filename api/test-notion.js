const axios = require('axios');

module.exports = async (req, res) => {
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
  try {
    if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
      return res.status(500).json({ success: false, message: 'Notion credentials not configured' });
    }
    const response = await axios.get(
      `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        },
        timeout: 5000
      }
    );
    res.json({
      success: true,
      message: 'Notion connection successful',
      database: {
        title: response.data.title?.[0]?.text?.content || 'Untitled',
        id: response.data.id
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Notion connection failed',
      error: error.response?.data?.message || error.message
    });
  }
};
