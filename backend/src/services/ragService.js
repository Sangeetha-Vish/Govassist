const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../../config/db');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// Rate Limiter storage: Map of sessionId/IP -> { count, resetTime }
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 25;

function checkRateLimit(identifier) {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    const waitSec = Math.ceil((record.resetTime - now) / 1000);
    return {
      allowed: false,
      message: `You've reached the message limit. Please wait ${waitSec} seconds before asking your next question.`,
    };
  }

  record.count += 1;
  return { allowed: true };
}

/**
 * Perform semantic search via Python ChromaDB query script, with fallback to JSON cache
 */
async function retrieveSchemeContext(query, limit = 6, filters = null) {
  return new Promise((resolve) => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const pythonExe = path.join(projectRoot, 'ai/venv/Scripts/python.exe');
    const queryScript = path.join(projectRoot, 'ai/query_chroma.py');

    if (!fs.existsSync(pythonExe) || !fs.existsSync(queryScript)) {
      console.warn('ChromaDB query script or Python venv not found, falling back to JSON cache');
      return resolve(fallbackJsonSearch(query, limit, filters));
    }

    const args = [queryScript, query, String(limit)];
    if (filters) {
      args.push(JSON.stringify(filters));
    }

    const proc = spawn(pythonExe, args);
    let outputData = '';
    let errorData = '';

    proc.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && outputData.trim()) {
        try {
          const parsed = JSON.parse(outputData.trim());
          if (parsed.success && parsed.results?.length > 0) {
            return resolve(parsed.results);
          }
        } catch (e) {
          console.error('Failed to parse ChromaDB output:', e);
        }
      }
      if (errorData) {
        console.warn('ChromaDB query notice/warning:', errorData);
      }
      // Fallback
      resolve(fallbackJsonSearch(query, limit, filters));
    });

    proc.on('error', (err) => {
      console.error('ChromaDB process spawn error:', err);
      resolve(fallbackJsonSearch(query, limit, filters));
    });
  });
}

/**
 * Fallback semantic search over JSON cache if ChromaDB is unavailable
 */
function fallbackJsonSearch(query, limit = 6, filters = null) {
  const projectRoot = path.resolve(__dirname, '../../../');
  const cachePath = path.join(projectRoot, 'ai/schemes_rag_cache.json');
  if (!fs.existsSync(cachePath)) {
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const chunks = raw.chunks || [];
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const scored = chunks.map(chunk => {
      const text = (chunk.text + ' ' + (chunk.metadata?.scheme_name || '')).toLowerCase();
      let matchCount = 0;
      queryTerms.forEach(term => {
        if (text.includes(term)) matchCount += 1;
      });

      if (filters?.category && chunk.metadata?.category !== filters.category) {
        matchCount -= 2;
      }
      return { ...chunk, score: matchCount };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (e) {
    console.error('JSON fallback search error:', e);
    return [];
  }
}

/**
 * Build personalized System Instruction and Context Prompt for Gemini RAG
 */
function buildRagPrompt(query, retrievedChunks, userProfile = null, verifiedDocs = []) {
  // Extract unique source URLs and citations
  const sources = [];
  const seenUrls = new Set();

  retrievedChunks.forEach(chunk => {
    const meta = chunk.metadata || {};
    const name = meta.scheme_name || 'Official Scheme';
    const url = meta.application_url || meta.source_url || 'https://www.india.gov.in';
    if (!seenUrls.has(url) && url !== 'https://www.india.gov.in') {
      seenUrls.add(url);
      sources.push({ scheme_name: name, url });
    }
  });

  const contextText = retrievedChunks.map((c, i) => `[Source ${i + 1} - ${c.metadata?.scheme_name || 'Scheme'}]:\n${c.text}`).join('\n\n');

  let profileContext = 'User Profile: Guest (Not signed in). Provide generalized scheme information.';
  if (userProfile && (userProfile.age || userProfile.education || userProfile.family_income || userProfile.location)) {
    profileContext = `User Profile (STORED SNAPSHOT):
- Age: ${userProfile.age || 'Not specified'}
- Education: ${userProfile.education || 'Not specified'} (${userProfile.field_of_study || ''})
- Annual Family Income: ${userProfile.family_income ? '₹' + Number(userProfile.family_income).toLocaleString('en-IN') : 'Not specified'}
- Location: ${userProfile.location || 'Not specified'}
- Category / Employment: ${userProfile.category || userProfile.employment_status || 'Not specified'}
- Verified Documents: ${verifiedDocs.length > 0 ? verifiedDocs.join(', ') : 'None uploaded yet'}`;
  }

  const systemInstruction = `You are GovAssist AI — the official, intelligent Scheme Assistant for Indian and Tamil Nadu government schemes.
Your task is to answer user queries with 100% factual accuracy using ONLY the provided verified scheme context.

GROUNDING & INTEGRITY RULES (STRICT):
1. ONLY USE RETRIEVED CONTEXT: Answer strictly using facts present in the retrieved scheme sources below.
2. NO FABRICATION: NEVER invent or guess eligibility conditions, grant amounts, deadlines, or scheme names.
3. NO-ANSWER / FALLBACK: If the retrieved sources do not contain verified info to answer the question, state:
   "I don't have verified details on this specific topic in our active database. You can search all 95 schemes in the [Scheme Finder](/finder) or explore the official national portal at [National Portal of India](https://www.india.gov.in)."
4. SOURCE CITATIONS: Always cite official scheme links whenever mentioning a scheme, formatted as: [Scheme Name](Official URL).
5. PERSONALIZATION: When the user's profile is provided, evaluate their eligibility against the scheme's criteria (Age, Income, Education, Location) and explicitly state how their profile matches:
   e.g., "Based on your profile — age 22, B.E., Tamil Nadu — you meet the eligibility criteria for..."
6. EXPIRED SCHEMES: If a scheme is flagged as expired, clearly state that applications are currently closed.
7. MULTILINGUAL: If the user asks in Tamil (தமிழ்), reply politely in Tamil while maintaining official scheme names and links.
8. TONE & STRUCTURE: Editorial, warm, respectful, concise, and structured with bold highlights and bullet points.`;

  return {
    systemInstruction,
    prompt: `Context Sources:\n${contextText || 'No relevant scheme records retrieved.'}\n\n${profileContext}\n\nUser Question:\n${query}`,
    sources,
    isPersonalized: !!userProfile?.age || !!userProfile?.family_income,
  };
}

/**
 * Stream RAG Response from Gemini API (or fallback generator)
 */
async function streamChatResponse({ query, userProfile, verifiedDocs, onToken, onDone, onError }) {
  try {
    // 1. Retrieve relevant scheme chunks
    const filter = {};
    if (userProfile?.category && userProfile.category !== 'all') {
      filter.category = userProfile.category.toLowerCase();
    }
    if (userProfile?.location?.toLowerCase().includes('tamil nadu')) {
      filter.location_scope = 'tamil_nadu';
    }

    const chunks = await retrieveSchemeContext(query, 6, Object.keys(filter).length > 0 ? filter : null);
    const { systemInstruction, prompt, sources, isPersonalized } = buildRagPrompt(query, chunks, userProfile, verifiedDocs);

    // 2. If Gemini API Key is configured, use Gemini Stream
    if (GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: DEFAULT_MODEL,
        systemInstruction: systemInstruction,
      });

      const result = await model.generateContentStream(prompt);
      let fullResponseText = '';

      for await (const chunk of result.stream) {
        const text = chunk.text();
        fullResponseText += text;
        onToken(text);
      }

      onDone({
        fullText: fullResponseText,
        sources,
        isPersonalized,
        chunksRetrieved: chunks.length,
      });
      return;
    }

    // 3. Fallback High-Quality Generator if API Key is not set
    console.warn('GEMINI_API_KEY not configured in .env. Using high-precision grounded local responder.');
    const fallbackResponse = generateLocalGroundedResponse(query, chunks, userProfile, sources);
    
    // Simulate natural progressive token streaming for smooth UI
    const words = fallbackResponse.split(' ');
    let fullText = '';
    for (let i = 0; i < words.length; i++) {
      const piece = (i === 0 ? '' : ' ') + words[i];
      fullText += piece;
      onToken(piece);
      await new Promise(r => setTimeout(r, 20));
    }

    onDone({
      fullText,
      sources,
      isPersonalized,
      chunksRetrieved: chunks.length,
    });
  } catch (err) {
    console.error('Error in streamChatResponse:', err);
    onError(err);
  }
}

/**
 * Local Grounded Responder for offline / development / missing key environments
 */
function generateLocalGroundedResponse(query, chunks, userProfile, sources) {
  if (!chunks || chunks.length === 0) {
    return "I don't have verified details on this specific topic in our active database. You can search all 95 schemes directly in the [Scheme Finder](/finder) or visit the [National Portal of India](https://www.india.gov.in).";
  }

  const primaryChunk = chunks[0];
  const meta = primaryChunk.metadata || {};
  const schemeName = meta.scheme_name || 'Government Scheme';
  const benefit = meta.benefit_value || meta.benefit_amount || 'Financial and welfare assistance';
  const url = meta.application_url || meta.source_url || 'https://www.india.gov.in';

  let response = `### [${schemeName}](${url})\n\n`;
  response += `**Estimated Benefit:** ${benefit}\n\n`;

  if (userProfile && (userProfile.age || userProfile.education)) {
    const ageOk = !meta.min_age || meta.min_age === -1 || (userProfile.age >= meta.min_age && (!meta.max_age || meta.max_age === -1 || userProfile.age <= meta.max_age));
    const eduMatch = userProfile.education ? `qualified with ${userProfile.education}` : 'education open';
    
    response += `**Personalized Eligibility Analysis:**\n`;
    response += `- **Profile match:** Based on your age (${userProfile.age || 'N/A'}) and location (${userProfile.location || 'Pan India'}), you ${ageOk ? 'meet the age criteria' : 'should verify the exact age bracket'}.\n`;
    response += `- **Education:** ${meta.education_min || 'Open criteria'} (${eduMatch}).\n`;
    response += `- **Income Cap:** ${meta.max_family_income && meta.max_family_income > 0 ? `Max ₹${Number(meta.max_family_income).toLocaleString('en-IN')}/year` : 'No income cap'}.\n\n`;
  } else {
    response += `**Key Criteria:**\n`;
    response += `- **Age:** ${meta.min_age && meta.min_age > 0 ? `${meta.min_age}–${meta.max_age || '∞'} yrs` : 'Any Age'}\n`;
    response += `- **Education:** ${meta.education_min || 'Open'}\n`;
    response += `- **Income Limit:** ${meta.max_family_income && meta.max_family_income > 0 ? `≤ ₹${Number(meta.max_family_income).toLocaleString('en-IN')}` : 'No Cap'}\n\n`;
  }

  response += `You can apply directly through the official government portal: [${schemeName} Official Application Portal](${url}).`;
  return response;
}

/**
 * Save chat log to database
 */
async function saveChatLog({ userId, sessionId, role, message, sources = [], isPersonalized = false }) {
  try {
    await pool.query(
      `INSERT INTO chat_logs (user_id, session_id, role, message, sources, is_personalized, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId || null, sessionId, role, message, JSON.stringify(sources), isPersonalized]
    );
  } catch (err) {
    console.error('Error saving chat log:', err.message);
  }
}

/**
 * Get conversation history for a session or user
 */
async function getChatHistory(sessionId, userId = null) {
  try {
    let query = `SELECT id, role, message, sources, is_personalized, created_at FROM chat_logs WHERE session_id = $1`;
    const params = [sessionId];

    if (userId) {
      query += ` OR user_id = $2`;
      params.push(userId);
    }

    query += ` ORDER BY created_at ASC LIMIT 50;`;

    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('Error fetching chat history:', err.message);
    return [];
  }
}

module.exports = {
  checkRateLimit,
  retrieveSchemeContext,
  streamChatResponse,
  saveChatLog,
  getChatHistory,
};
