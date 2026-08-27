const {
  checkRateLimit,
  streamChatResponse,
  saveChatLog,
  saveFeedback,
  deleteChatHistory,
  getChatHistory
} = require('../services/ragService');
const pool = require('../../config/db');

/**
 * Streaming RAG Chat Endpoint (SSE)
 * Handles full citizen journey (eligibility, how it works, deadlines, form filling, tracking)
 */
async function streamChat(req, res) {
  const { message, sessionId, profile: clientProfile, verifiedDocs = [], activeScheme = null } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: { message: 'Message text is required.' } });
  }

  const effectiveSessionId = sessionId || `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const clientIdentifier = req.ip || effectiveSessionId;

  // 1. Rate Limiting Check (IP + Session)
  const rateCheck = checkRateLimit(clientIdentifier);
  if (!rateCheck.allowed) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'error', message: rateCheck.message })}\n\n`);
    return res.end();
  }

  // 2. Fetch Stored Profile & Documents if user is signed in
  let userProfile = clientProfile || null;
  let userVerifiedDocs = Array.isArray(verifiedDocs) ? verifiedDocs : [];
  let userUnverifiedDocs = [];

  if (req.user?.id) {
    try {
      const profRes = await pool.query('SELECT * FROM profiles WHERE user_id = $1 LIMIT 1', [req.user.id]);
      if (profRes.rows.length > 0) {
        userProfile = { ...profRes.rows[0], ...(clientProfile || {}) };
      }

      const docRes = await pool.query(
        "SELECT document_type, verification_status FROM documents WHERE user_id = $1",
        [req.user.id]
      );
      
      const vDocs = docRes.rows.filter(r => r.verification_status === 'verified').map(r => r.document_type);
      const uDocs = docRes.rows.filter(r => r.verification_status !== 'verified').map(r => r.document_type);
      
      userVerifiedDocs = Array.from(new Set([...userVerifiedDocs, ...vDocs]));
      userUnverifiedDocs = Array.from(new Set(uDocs));
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
    activeSchemeId: activeScheme?.scheme_id || null,
  });

  // 4. Initialize SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'start', sessionId: effectiveSessionId })}\n\n`);

  // 5. Stream Progressive Tokens
  await streamChatResponse({
    query: message.trim(),
    userProfile,
    verifiedDocs: userVerifiedDocs,
    unverifiedDocs: userUnverifiedDocs,
    activeScheme,
    onToken: (token) => {
      res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`);
    },
    onDone: ({ fullText, sources, isPersonalized, chunksRetrieved, activeScheme: resolvedActiveScheme }) => {
      saveChatLog({
        userId: req.user?.id || null,
        sessionId: effectiveSessionId,
        role: 'assistant',
        message: fullText,
        sources,
        isPersonalized,
        activeSchemeId: resolvedActiveScheme?.scheme_id || null,
      });

      res.write(`data: ${JSON.stringify({
        type: 'done',
        sources,
        isPersonalized,
        chunksRetrieved,
        activeScheme: resolvedActiveScheme
      })}\n\n`);
      res.end();
    },
    onError: (err) => {
      console.error('Chat streaming error:', err);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message: 'Assistant is temporarily unavailable. Please try again or search directly in Scheme Finder.',
        })}\n\n`
      );
      res.end();
    },
  });
}

/**
 * Log Quality Feedback (Thumbs Up / Down)
 */
async function submitFeedback(req, res) {
  const { messageId, rating, comment } = req.body || {};
  if (!messageId || !rating) {
    return res.status(400).json({ error: { message: 'messageId and rating (+1 / -1) are required.' } });
  }

  const success = await saveFeedback(messageId, Number(rating), comment || '');
  return res.status(200).json({ success });
}

/**
 * Clear Chat History (User Privacy & Compliance)
 */
async function clearHistory(req, res) {
  const { sessionId } = req.body || {};
  const userId = req.user?.id || null;

  if (!sessionId && !userId) {
    return res.status(400).json({ error: { message: 'sessionId or authenticated user required.' } });
  }

  const success = await deleteChatHistory(sessionId, userId);
  return res.status(200).json({ success, message: 'Chat history cleared successfully.' });
}

/**
 * Get Conversation History for current session
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
  submitFeedback,
  clearHistory,
  getHistory,
};
