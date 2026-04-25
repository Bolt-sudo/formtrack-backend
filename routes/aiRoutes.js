const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const axios = require('axios');

router.post('/generate-questions', protect, async (req, res) => {
  const { topic, subject, questionCount = 5 } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an educational assistant for FormTrack. You must output ONLY a JSON object containing a questions array. No conversational text or markdown blocks.'
          },
          {
            role: 'user',
            content: `Generate ${questionCount} college-level questions for a ${subject || 'General'} form about "${topic}". 
            
Return exactly this format:
{
  "questions": [
    {
      "title": "Question text?",
      "type": "radio",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "required": true
    },
    {
      "title": "Short answer question?",
      "type": "text",
      "options": [],
      "required": true
    }
  ]
}`
          }
        ],
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    const parsedData = JSON.parse(content);
    const questions = Array.isArray(parsedData) ? parsedData : parsedData.questions;

    if (!questions) {
      throw new Error('Invalid format received from AI');
    }

    res.json({ success: true, questions });

  } catch (err) {
    console.error('Groq AI Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate questions. Verify your GROQ_API_KEY in .env'
    });
  }
});

module.exports = router;