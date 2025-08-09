const axios = require('axios');

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Simple in-memory rate limiting (not persistent across invocations)
const submissionTracker = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const MAX_SUBMISSIONS_PER_EMAIL = 3;

function isRateLimited(email) {
  const now = Date.now();
  const emailData = submissionTracker.get(email);
  if (!emailData) {
    submissionTracker.set(email, { count: 1, firstSubmission: now });
    return false;
  }
  if (now - emailData.firstSubmission > RATE_LIMIT_WINDOW) {
    submissionTracker.set(email, { count: 1, firstSubmission: now });
    return false;
  }
  if (emailData.count >= MAX_SUBMISSIONS_PER_EMAIL) {
    return true;
  }
  emailData.count++;
  return false;
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method Not Allowed' });
    return;
  }
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ success: false, message: 'Email and role are required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }
    if (isRateLimited(email.toLowerCase())) {
      return res.status(429).json({ success: false, message: 'Too many submissions. Please try again later.' });
    }
    const validRoles = [
      'Student / Learner',
      'Tutor / Teacher',
      'School / Institute',
      'Developer / Researcher'
    ];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role selected' });
    }
    if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
      return res.status(500).json({ success: false, message: 'Server configuration error. Please contact support.' });
    }
    const notionPayload = {
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        "Name": { title: [{ text: { content: email } }] },
        "Email": { email: email },
        "Role": { select: { name: role } },
        "SubmitAt": { date: { start: new Date().toISOString().split('T')[0] } }
      }
    };
    const response = await axios.post(
      'https://api.notion.com/v1/pages',
      notionPayload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        timeout: 10000
      }
    );
    res.json({ success: true, message: 'Successfully added to waitlist! We\'ll be in touch soon.' });
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 400:
          res.status(400).json({ success: false, message: 'Invalid request format. Please try again.' });
          break;
        case 401:
          res.status(500).json({ success: false, message: 'Server authentication error. Please contact support.' });
          break;
        case 404:
          res.status(500).json({ success: false, message: 'Database configuration error. Please contact support.' });
          break;
        case 429:
          res.status(429).json({ success: false, message: 'Server is busy. Please try again in a moment.' });
          break;
        default:
          res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
      }
    } else if (error.code === 'ECONNABORTED') {
      res.status(408).json({ success: false, message: 'Request timeout. Please try again.' });
    } else {
      res.status(500).json({ success: false, message: 'Network error. Please check your connection and try again.' });
    }
  }
};
