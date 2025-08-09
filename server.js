require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://127.0.0.1:3000', 
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Validation function
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Rate limiting (simple in-memory store)
const submissionTracker = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_SUBMISSIONS_PER_EMAIL = 3;

function isRateLimited(email) {
  const now = Date.now();
  const emailData = submissionTracker.get(email);
  
  if (!emailData) {
    submissionTracker.set(email, { count: 1, firstSubmission: now });
    return false;
  }
  
  // Reset if window has passed
  if (now - emailData.firstSubmission > RATE_LIMIT_WINDOW) {
    submissionTracker.set(email, { count: 1, firstSubmission: now });
    return false;
  }
  
  // Check if over limit
  if (emailData.count >= MAX_SUBMISSIONS_PER_EMAIL) {
    return true;
  }
  
  // Increment counter
  emailData.count++;
  return false;
}

// Waitlist submission endpoint
app.post('/api/waitlist', async (req, res) => {
  try {
    const { email, role } = req.body;

    // Validation
    if (!email || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and role are required' 
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter a valid email address' 
      });
    }

    // Rate limiting
    if (isRateLimited(email.toLowerCase())) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many submissions. Please try again later.' 
      });
    }

    // Valid roles
    const validRoles = [
      'Student / Learner', 
      'Tutor / Teacher', 
      'School / Institute', 
      'Developer / Researcher'
    ];
    
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role selected' 
      });
    }

    // Check environment variables
    if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
      console.error('❌ Missing environment variables');
      return res.status(500).json({ 
        success: false, 
        message: 'Server configuration error. Please contact support.' 
      });
    }

    // Prepare Notion payload
    const notionPayload = {
      parent: {
        database_id: process.env.NOTION_DATABASE_ID
      },
      properties: {
        "Name": {
          title: [
            {
              text: {
                content: email
              }
            }
          ]
        },
        "Email": {
          email: email
        },
        "Role": {
          select: {
            name: role
          }
        },
        "SubmitAt": {
          date: {
            start: new Date().toISOString().split('T')[0]
          }
        }
      }
    };

    console.log('📤 Submitting to Notion:', { email, role });

    // Submit to Notion
    const response = await axios.post(
      'https://api.notion.com/v1/pages',
      notionPayload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    console.log('✅ Successfully added to waitlist:', email);
    console.log('📊 Notion response status:', response.status);
    
    res.json({ 
      success: true, 
      message: 'Successfully added to waitlist! We\'ll be in touch soon.' 
    });

  } catch (error) {
    console.error('❌ Error submitting to Notion:', error.response?.data || error.message);
    
    // Handle specific Notion API errors
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      switch (status) {
        case 400:
          console.error('Bad Request:', errorData);
          res.status(400).json({ 
            success: false, 
            message: 'Invalid request format. Please try again.' 
          });
          break;
        case 401:
          console.error('Unauthorized:', errorData);
          res.status(500).json({ 
            success: false, 
            message: 'Server authentication error. Please contact support.' 
          });
          break;
        case 404:
          console.error('Database not found:', errorData);
          res.status(500).json({ 
            success: false, 
            message: 'Database configuration error. Please contact support.' 
          });
          break;
        case 429:
          console.error('Rate limited by Notion:', errorData);
          res.status(429).json({ 
            success: false, 
            message: 'Server is busy. Please try again in a moment.' 
          });
          break;
        default:
          res.status(500).json({ 
            success: false, 
            message: 'Something went wrong. Please try again.' 
          });
      }
    } else if (error.code === 'ECONNABORTED') {
      // Timeout error
      res.status(408).json({ 
        success: false, 
        message: 'Request timeout. Please try again.' 
      });
    } else {
      // Network or other error
      res.status(500).json({ 
        success: false, 
        message: 'Network error. Please check your connection and try again.' 
      });
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const isConfigured = !!(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
  
  res.json({ 
    status: 'OK', 
    message: 'Techdio backend is running',
    timestamp: new Date().toISOString(),
    configured: isConfigured,
    version: '1.0.0'
  });
});

// Test Notion connection endpoint
app.get('/api/test-notion', async (req, res) => {
  try {
    if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
      return res.status(500).json({ 
        success: false, 
        message: 'Notion credentials not configured' 
      });
    }

    // Test by retrieving database info
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
    console.error('❌ Notion connection test failed:', error.response?.data || error.message);
    
    res.status(500).json({
      success: false,
      message: 'Notion connection failed',
      error: error.response?.data?.message || error.message
    });
  }
});

// Serve the main HTML file at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

const server = app.listen(PORT, () => {
  console.log('🚀 Techdio Backend Server Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Server running on: http://localhost:${PORT}`);
  console.log(`📊 Database ID: ${process.env.NOTION_DATABASE_ID || 'NOT SET'}`);
  console.log(`🔑 Token configured: ${process.env.NOTION_TOKEN ? 'Yes' : 'No'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔗 Available endpoints:');
  console.log('   GET  /                 - Main website');
  console.log('   POST /api/waitlist     - Submit waitlist form');
  console.log('   GET  /api/health       - Health check');
  console.log('   GET  /api/test-notion  - Test Notion connection');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n📴 Received SIGINT. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});