const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const jwt = require('jsonwebtoken');

// Optional auth helper: extracts user if provided, otherwise passes as guest
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.decode(token); // Decode Supabase JWT without blocking on signature
      if (decoded && decoded.sub) {
        req.user = { id: decoded.sub, email: decoded.email };
      }
    } else if (req.headers['x-user-id']) {
      req.user = { id: req.headers['x-user-id'] };
    }
  } catch (e) {
    // Ignore and proceed as guest
  }
  next();
}

// POST /api/chat/stream - SSE Streaming RAG chat
router.post('/stream', optionalAuth, chatController.streamChat);

// GET /api/chat/history - Retrieve conversation history
router.get('/history', optionalAuth, chatController.getHistory);

module.exports = router;
