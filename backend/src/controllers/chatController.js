const { checkRateLimit, streamChatResponse, saveChatLog, getChatHistory } = require('../services/ragService');
const pool = require('../../config/db');

/**
 * Streaming RAG Chat Endpoint (SSE)
 * Works for both authenticated users and guests
 */
async function streamChat(req, res) {
  const { message, sessionId, profile: clientProfile, verifiedDocs = [] } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: { message: 'Message text is required.' } });
  }

  const effectiveSessionId = sessionId || `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const clientIdentifier = req.user?.id || effectiveSessionId || req.ip;

  // 1. Rate Limiting Check
  const rateCheck = checkRateLimit(clientIdentifier);
  if (!rateCheck.allowed) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'error', message: rateCheck.message })}\n\n`);
    return res.end();
  }

  // 2. Fetch Stored Profile & Verified Documents if authenticated
  let userProfile = clientProfile || null;
  let userVerifiedDocs = Array.isArray(verifiedDocs) ? verifiedDocs : [];

  if (req.user?.id) {
    try {
      const profRes = await pool.query('SELECT * FROM profiles WHERE user_id = $1 LIMIT 1', [req.user.id]);
      if (profRes.rows.length > 0) {
        userProfile = { ...profRes.rows[0], ...(clientProfile || {}) };
      }

      const docRes = await pool.query(
        "SELECT document_type FROM documents WHERE user_id = $1 AND verification_status = 'verified'",
        [req.user.id]
      );
      const dbDocs = docRes.rows.map(r => r.document_type);
      userVerifiedDocs = Array.from(new Set([...userVerifiedDocs, ...dbDocs]));
    } catch (dbErr) {
      console.warn('Could not load user profile/docs from DB:', dbErr.message);
    }
  }

  // 3. Save User Query to Chat Logs asynchronously
  saveChatLog({
    userId: req.user?.id || null,
    sessionId: effectiveSessionId,
    role: 'user',
    message: message.trim(),
  });

  // 4. Initialize SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial session acknowledgment
  res.write(`data: ${JSON.stringify({ type: 'start', sessionId: effectiveSessionId })}\n\n`);

  // 5. Stream Progressive Tokens via RAG Service
  await streamChatResponse({
    query: message.trim(),
    userProfile,
    verifiedDocs: userVerifiedDocs,
    onToken: (token) => {
      res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`);
    },
    onDone: ({ fullText, sources, isPersonalized, chunksRetrieved }) => {
      // Save assistant response to DB
      saveChatLog({
        userId: req.user?.id || null,
        sessionId: effectiveSessionId,
        role: 'assistant',
        message: fullText,
        sources,
        isPersonalized,
      });

      res.write(`data: ${JSON.stringify({ type: 'done', sources, isPersonalized, chunksRetrieved })}\n\n`);
      res.end();
    },
    onError: (err) => {
      console.error('Chat streaming failed:', err);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message: 'Assistant is temporarily unavailable. Please try again or check Scheme Finder directly.',
        })}\n\n`
      );
      res.end();
    },
  });
}

/**
 * Get Conversation History for current session or user
 */
async function getHistory(req, res) {
  const { sessionId } = req.query;
  const userId = req.user?.id || null;

  if (!sessionId && !userId) {
    return res.status(200).json({ success: true, data: [] });
  }

  const history = await getChatHistory(sessionId, userId);
  return res.status(200).json({ success: true, data: history });
}

module.exports = {
  streamChat,
  getHistory,
};
