const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../../config/db');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// Rate Limiter storage
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 25;
const MAX_REQUESTS_PER_DAY = 500;

function checkRateLimit(ipOrId) {
  const now = Date.now();
  let record = rateLimitMap.get(ipOrId);

  if (!record) {
    record = {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
      dailyCount: 0,
      dailyResetTime: now + 24 * 60 * 60 * 1000,
    };
    rateLimitMap.set(ipOrId, record);
  }

  if (now > record.dailyResetTime) {
    record.dailyCount = 0;
    record.dailyResetTime = now + 24 * 60 * 60 * 1000;
  }
  if (record.dailyCount >= MAX_REQUESTS_PER_DAY) {
    return {
      allowed: false,
      message: "You've reached the daily conversation limit for GovAssist AI. Please try again tomorrow or explore Scheme Finder directly.",
    };
  }

  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    const waitSec = Math.ceil((record.resetTime - now) / 1000);
    return {
      allowed: false,
      message: `Please wait ${waitSec} seconds before sending another message.`,
    };
  }

  record.count += 1;
  record.dailyCount += 1;
  return { allowed: true };
}

/**
 * Gate 1: Off-Topic Classifier
 * Returns true if the query is unrelated to government schemes or welfare assistance.
 */
function detectOffTopicQuery(query) {
  if (!query || typeof query !== 'string') return true;
  const q = query.trim().toLowerCase();

  // Basic greetings & bot identity
  const greetings = ['hello', 'hi', 'hey', 'good morning', 'good evening', 'who are you', 'what is your name', 'how are you'];
  if (greetings.includes(q)) {
    return {
      isOffTopic: true,
      response: "Hello! I am GovAssist AI, your official Scheme Assistant for Indian and Tamil Nadu government welfare schemes. How can I help you find schemes, check eligibility, verify deadlines, or navigate applications today?"
    };
  }

  // Weather
  if (/\b(weather|temperature|forecast|rain|climate|humidity)\b/i.test(q)) {
    return {
      isOffTopic: true,
      response: "I am specialized exclusively in helping citizens discover and apply for government welfare schemes. For live weather updates, please check official meteorological services. Would you like to check agricultural, student, or startup schemes instead?"
    };
  }

  // Generic non-scheme topics
  const offTopicPatterns = [
    /\b(write (a )?(python|javascript|code|script|poem|essay|story|song))\b/i,
    /\b(solve|math|equation|calculate)\s+\d+/i,
    /\b(who (is|won)|president of|prime minister of (us|uk|canada|france)|capital of)\b/i,
    /\b(tell me a joke|movie review|recipe for|football score|cricket score)\b/i,
    /^(what is (2\+2|\d+\s*[\+\-\*\/]\s*\d+))/i,
  ];

  for (const pattern of offTopicPatterns) {
    if (pattern.test(q)) {
      return {
        isOffTopic: true,
        response: "I am designed specifically to assist citizens with government welfare schemes, eligibility verification, deadlines, and application processes. Please ask any scheme-related question, or explore our [Scheme Finder](/finder)."
      };
    }
  }

  return { isOffTopic: false };
}

/**
 * Intent Classifier
 */
function classifyIntent(query) {
  const q = query.toLowerCase();

  if (/\b(what happens after|after (i )?submit|submitted (my )?application|what next|next step after applying|scrutiny process|verification timeline)\b/i.test(q)) {
    return 'POST_SUBMISSION';
  }
  if (/\b(help me fill|fill(ing)? (the |this )?form|gross or net|annual family income|what do i put|form guidance|how to fill)\b/i.test(q)) {
    return 'FORM_FILLING_HELP';
  }
  if (/\b(deadline|last date|when is the|application window|due date|closing date|open date)\b/i.test(q)) {
    return 'DEADLINE';
  }
  if (/\b(how (do|can) i apply|application (steps|procedure|process)|how to apply|where to apply)\b/i.test(q)) {
    return 'HOW_TO_APPLY';
  }
  if (/\b(how does (this|it) work|disbursement|who runs|how it works|implementing agency)\b/i.test(q)) {
    return 'HOW_IT_WORKS';
  }
  if (/\b(track|status|check (my )?(application )?status|application status)\b/i.test(q)) {
    return 'APPLICATION_TRACKING';
  }
  return 'GENERAL_QUERY';
}

/**
 * Pronoun / Continuation Detection
 * Checks if the user is asking a follow-up about the active scheme or introducing a new scheme/topic.
 */
function isContinuationFollowUp(query, activeScheme) {
  if (!activeScheme) return false;
  const q = query.toLowerCase();

  // If query explicitly mentions known scheme keywords, it's NOT a continuation
  const schemeKeywords = [
    'pmfme', 'pmegp', 'nidhi', 'prayas', 'samriddhi', 'pragati', 'saksham',
    'mudra', 'aabcs', 'uyegp', 'needs', 'naan mudhalvan', 'central sector',
    'nsp', 'scholarship', 'aicte', 'tiic', 'cmfp', 'free laptop'
  ];

  const mentionsOtherScheme = schemeKeywords.some(kw => {
    return q.includes(kw) && !activeScheme.scheme_name.toLowerCase().includes(kw);
  });

  if (mentionsOtherScheme) {
    return false;
  }

  // Pronoun / follow-up tokens
  const followUpTokens = [
    'this', 'it', 'that', 'the scheme', 'for this', 'for it', 'these',
    'deadline', 'apply', 'documents', 'track', 'status', 'fill', 'submit'
  ];

  return followUpTokens.some(t => q.includes(t));
}

/**
 * Extract named scheme entity candidate from query
 */
function extractSchemeEntityFromQuery(query) {
  const q = query.trim();
  // Strip common question words
  const stripped = q
    .replace(/^(what is|tell me about|how to apply for|when is the deadline for|deadline for|how does|what are the criteria for|status of|help with)\s+/i, '')
    .replace(/\?+$/, '')
    .trim();

  return stripped.length > 2 ? stripped : query;
}

/**
 * Confidence & Fuzzy Match Verification Gate
 * Ensures retrieved results genuinely match the user's requested scheme entity.
 */
function verifySchemeMatch(extractedEntity, topChunk) {
  if (!topChunk || !topChunk.metadata) {
    return { isMatch: false, reason: 'No chunks retrieved' };
  }

  const meta = topChunk.metadata;
  const schemeName = (meta.scheme_name || '').toLowerCase();
  const chunkText = (topChunk.text || '').toLowerCase();
  const entity = extractedEntity.toLowerCase();

  // Distance check (if ChromaDB distance is available)
  if (topChunk.distance !== null && topChunk.distance !== undefined) {
    if (topChunk.distance > 1.25) {
      return { isMatch: false, reason: `Similarity distance too high (${topChunk.distance.toFixed(2)})` };
    }
  }

  // Entity token overlap check
  const entityWords = entity.split(/\s+/).filter(w => w.length > 3 && !['scheme', 'when', 'deadline', 'apply', 'what', 'about', 'government'].includes(w));
  if (entityWords.length > 0) {
    const hasOverlap = entityWords.some(word => schemeName.includes(word) || chunkText.includes(word));
    if (!hasOverlap) {
      return { isMatch: false, reason: `Entity '${extractedEntity}' not found in top candidate '${meta.scheme_name}'` };
    }
  }

  return { isMatch: true, scheme: { scheme_id: meta.scheme_id, scheme_name: meta.scheme_name } };
}

/**
 * Retrieve ChromaDB Knowledge Base via Python CLI
 */
async function retrieveSchemeContext(query, limit = 8, filters = null) {
  return new Promise((resolve) => {
    const projectRoot = path.resolve(__dirname, '../../../');
    const pythonExe = path.join(projectRoot, 'ai/venv/Scripts/python.exe');
    const queryScript = path.join(projectRoot, 'ai/query_chroma.py');

    if (!fs.existsSync(pythonExe) || !fs.existsSync(queryScript)) {
      return resolve(fallbackJsonSearch(query, limit, filters));
    }

    const args = [queryScript, query, String(limit)];
    if (filters) {
      args.push(JSON.stringify(filters));
    }

    const proc = spawn(pythonExe, args);
    let outputData = '';
    let errorData = '';

    proc.stdout.on('data', (data) => { outputData += data.toString(); });
    proc.stderr.on('data', (data) => { errorData += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && outputData.trim()) {
        try {
          const parsed = JSON.parse(outputData.trim());
          if (parsed.success && parsed.results?.length > 0) {
            return resolve(parsed.results);
          }
        } catch (e) {
          console.error('Chroma output parse error:', e);
        }
      }
      resolve(fallbackJsonSearch(query, limit, filters));
    });

    proc.on('error', (err) => {
      console.error('ChromaDB spawn error:', err);
      resolve(fallbackJsonSearch(query, limit, filters));
    });
  });
}

/**
 * Fallback semantic search over JSON cache
 */
function fallbackJsonSearch(query, limit = 8, filters = null) {
  const projectRoot = path.resolve(__dirname, '../../../');
  const cachePath = path.join(projectRoot, 'ai/schemes_rag_cache.json');
  if (!fs.existsSync(cachePath)) return [];

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
    console.error('Fallback search error:', e);
    return [];
  }
}

/**
 * Build 3-Tier Grounded Prompt
 */
function buildRagPrompt(query, intent, retrievedChunks, userProfile = null, verifiedDocs = [], unverifiedDocs = [], activeScheme = null) {
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

  const contextText = retrievedChunks.map((c, i) => `[Source ${i + 1} - ${c.metadata?.scheme_name || 'Scheme'} | ${c.metadata?.section_type || 'info'}]:\n${c.text}`).join('\n\n');

  let profileContext = 'User Profile: Guest / Unauthenticated (No stored snapshot).';
  if (userProfile && (userProfile.age || userProfile.education || userProfile.family_income || userProfile.location)) {
    profileContext = `User Profile (STORED SNAPSHOT):
- Age: ${userProfile.age || 'Not specified'}
- Education: ${userProfile.education || 'Not specified'} (${userProfile.field_of_study || ''})
- Annual Family Income: ${userProfile.family_income ? '₹' + Number(userProfile.family_income).toLocaleString('en-IN') : 'Not specified'}
- Location: ${userProfile.location || 'Not specified'}
- Category / Employment: ${userProfile.category || userProfile.employment_status || 'Not specified'}
- Verified Documents on File: ${verifiedDocs.length > 0 ? verifiedDocs.join(', ') : 'None verified yet'}
- Unverified / Pending Documents: ${unverifiedDocs.length > 0 ? unverifiedDocs.join(', ') : 'None'}`;
  }

  const systemInstruction = `You are GovAssist AI — the official, intelligent Scheme Assistant for Indian and Tamil Nadu government welfare schemes.
Your task is to answer citizen questions with strict factual accuracy using ONLY the provided verified context.

INTENT FOCUS: The user is asking with intent: ${intent}.

RULES:
1. STRICT GROUNDING & THREE-TIER CONFIDENCE:
   - Tier 1 [Verified Scheme Fact]: Facts from retrieved context. State with absolute fidelity.
   - Tier 2 [General Form Guidance]: General government form conventions (e.g. gross vs net income, Aadhaar-NPCI bank seeding). Explicitly tag with [General Form Guidance].
   - Tier 3 [Honest Fallback]: If a specific detail is not in context, state: "I don't have verified information on X in our database — please check the official portal."
2. NEVER SUBSTITUTE UNRELATED SCHEMES: If retrieved context does not match what the user asked, politely state you couldn't find verified records.
3. TIME-SENSITIVE ANSWERS: For deadline queries, always state: "📅 Last verified on: [Date from source]. Always verify active portal dates before submitting."
4. CITATIONS: Format official links as [Scheme Name](URL).`;

  return {
    systemInstruction,
    prompt: `Context Sources:\n${contextText || 'No relevant scheme records retrieved.'}\n\n${profileContext}\n\nUser Question:\n${query}`,
    sources,
    isPersonalized: !!userProfile?.age || !!userProfile?.family_income,
  };
}

const { classifyQuery, detectOffTopic } = require('./chat/intentClassifier');
const {
  getSchemeByNameOrAlias,
  getUserDocumentRecord,
  getLiveUserRecommendations,
  discoverSchemesByCriteria
} = require('./chat/structuredLookups');
const {
  composeEligibilityResponse,
  composeDocumentTroubleshootingResponse,
  composeRecommendationsResponse,
  composeDiscoveryResponse,
  composeProcessingTimeResponse,
  composeDisambiguationResponse
} = require('./chat/responseComposer');

/**
 * Stream helper: Emits text token by token with smooth pacing
 */
async function streamText(text, onToken, delayMs = 12) {
  const words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    const piece = (i === 0 ? '' : ' ') + words[i];
    onToken(piece);
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

/**
 * Stream RAG Response — Hybrid Architecture:
 * 1. Structured Database Lookups (Capabilities 1-5) as Primary
 * 2. Vector RAG only for open-ended unstructured prose
 */
async function streamChatResponse({ query, userProfile, verifiedDocs = [], unverifiedDocs = [], activeScheme = null, userId = null, onToken, onDone, onError }) {
  try {
    const cleanQuery = (query || '').trim();

    // ─── GATE 1: Off-Topic Classifier ───
    const offTopicCheck = detectOffTopic(cleanQuery);
    if (offTopicCheck.isOffTopic) {
      await streamText(offTopicCheck.response, onToken);
      onDone({
        fullText: offTopicCheck.response,
        sources: [], // No badges on off-topic
        isPersonalized: false,
        chunksRetrieved: 0,
        activeScheme: null,
      });
      return;
    }

    // ─── GATE 2: Intent Classification ───
    const { intent } = classifyQuery(cleanQuery);

    // ─── CAPABILITY 2: Document Verification / Rejection Troubleshooting ───
    if (intent === 'DOCUMENT_TROUBLESHOOTING') {
      const docRecord = await getUserDocumentRecord(userId || userProfile?.user_id, cleanQuery);
      const res = composeDocumentTroubleshootingResponse(docRecord, userProfile);
      await streamText(res.text, onToken);
      onDone({
        fullText: res.text,
        sources: res.sources,
        isPersonalized: res.isPersonalized,
        chunksRetrieved: docRecord ? 1 : 0,
        activeScheme: null,
      });
      return;
    }

    // ─── CAPABILITY 3: Live Personalized Recommendations ───
    if (intent === 'PERSONALIZED_RECOMMENDATIONS') {
      const recs = await getLiveUserRecommendations(userProfile);
      const res = composeRecommendationsResponse(recs, userProfile);
      await streamText(res.text, onToken);
      onDone({
        fullText: res.text,
        sources: res.sources,
        isPersonalized: res.isPersonalized,
        chunksRetrieved: recs.length,
        activeScheme: null,
      });
      return;
    }

    // ─── CAPABILITY 4: Natural-Language Situation Discovery ───
    if (intent === 'NATURAL_LANGUAGE_DISCOVERY') {
      const discovered = await discoverSchemesByCriteria(cleanQuery, userProfile);
      const res = composeDiscoveryResponse(discovered, cleanQuery);
      await streamText(res.text, onToken);
      onDone({
        fullText: res.text,
        sources: res.sources,
        isPersonalized: res.isPersonalized,
        chunksRetrieved: discovered.length,
        activeScheme: null,
      });
      return;
    }

    // ─── CAPABILITY 1 & 5 & NAMED SCHEME LOOKUPS: Structured DB Lookup First ───
    const isContinuation = isContinuationFollowUp(cleanQuery, activeScheme);
    const lookupTarget = isContinuation && activeScheme ? activeScheme.scheme_name : cleanQuery;
    const dbLookup = await getSchemeByNameOrAlias(lookupTarget);

    if (dbLookup.isAmbiguous && dbLookup.candidates) {
      const res = composeDisambiguationResponse(dbLookup.candidates, cleanQuery);
      await streamText(res.text, onToken);
      onDone({
        fullText: res.text,
        sources: [],
        isPersonalized: false,
        chunksRetrieved: dbLookup.candidates.length,
        activeScheme: null,
      });
      return;
    }

    const scheme = dbLookup.scheme || activeScheme;

    // If scheme was found in DB
    if (scheme) {
      // Capability 5: Processing Time
      if (intent === 'PROCESSING_TIME') {
        const res = composeProcessingTimeResponse(scheme);
        await streamText(res.text, onToken);
        onDone({
          fullText: res.text,
          sources: res.sources,
          isPersonalized: res.isPersonalized,
          chunksRetrieved: 1,
          activeScheme: { scheme_id: scheme.scheme_id, scheme_name: scheme.scheme_name },
        });
        return;
      }

      // Capability 1: Eligibility & Criteria
      if (intent === 'ELIGIBILITY_CHECK' || (!intent || intent === 'GENERAL_QUERY')) {
        const res = composeEligibilityResponse(scheme, userProfile, verifiedDocs);
        await streamText(res.text, onToken);
        onDone({
          fullText: res.text,
          sources: res.sources,
          isPersonalized: res.isPersonalized,
          chunksRetrieved: 1,
          activeScheme: { scheme_id: scheme.scheme_id, scheme_name: scheme.scheme_name },
        });
        return;
      }
    }

    // ─── SECONDARY PATH: Vector RAG for open-ended prose / instructions ───
    let searchQuery = cleanQuery;
    if (scheme) {
      searchQuery = `${scheme.scheme_name} ${cleanQuery}`;
    }

    const chunks = await retrieveSchemeContext(searchQuery, 6);
    const extractedEntity = extractSchemeEntityFromQuery(cleanQuery);
    let resolvedScheme = scheme ? { scheme_id: scheme.scheme_id, scheme_name: scheme.scheme_name } : null;
    let confidencePassed = true;

    if (chunks.length > 0) {
      const matchResult = verifySchemeMatch(scheme ? scheme.scheme_name : extractedEntity, chunks[0]);
      if (matchResult.isMatch) {
        resolvedScheme = resolvedScheme || matchResult.scheme;
      } else if (!scheme && extractedEntity.length > 3) {
        confidencePassed = false;
      }
    } else if (!scheme) {
      confidencePassed = false;
    }

    // If confidence failed: return honest grounded no-match
    if (!confidencePassed || (chunks.length === 0 && !scheme)) {
      const notFoundText = `I couldn't find verified records for **"${extractedEntity}"** in our active database. It might be listed under a different official department title or is not yet indexed in our registry.\n\nYou can search all active schemes directly in the [Scheme Finder](/finder) or visit the official [National Portal of India](https://www.india.gov.in).`;
      await streamText(notFoundText, onToken);
      onDone({
        fullText: notFoundText,
        sources: [], // EMPTY sources -> No badge on non-match!
        isPersonalized: false,
        chunksRetrieved: 0,
        activeScheme: null,
      });
      return;
    }

    const { systemInstruction, prompt, sources, isPersonalized } = buildRagPrompt(cleanQuery, intent, chunks, userProfile, verifiedDocs, unverifiedDocs, resolvedScheme);

    // If Gemini is available, stream LLM generation
    if (GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: DEFAULT_MODEL,
        systemInstruction,
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
        activeScheme: resolvedScheme,
      });
      return;
    }

    // Local deterministic generator fallback
    const fallbackResponse = generateLocalIntentResponse({
      query: cleanQuery,
      intent,
      chunks,
      userProfile,
      verifiedDocs,
      unverifiedDocs,
      activeScheme: resolvedScheme,
    });

    await streamText(fallbackResponse, onToken);

    onDone({
      fullText: fallbackResponse,
      sources,
      isPersonalized,
      chunksRetrieved: chunks.length,
      activeScheme: resolvedScheme,
    });
  } catch (err) {
    console.error('Error in streamChatResponse:', err);
    onError?.(err);
  }
}

/**
 * Local Intent-Specific Responder
 */
function generateLocalIntentResponse({ intent, chunks, userProfile, verifiedDocs, unverifiedDocs, activeScheme }) {
  const primaryChunk = chunks[0] || {};
  const meta = primaryChunk.metadata || {};
  const schemeName = meta.scheme_name || activeScheme?.scheme_name || 'Government Scheme';
  const benefit = meta.benefit_value || meta.benefit_amount || 'Financial and welfare assistance';
  const url = meta.application_url || meta.source_url || 'https://www.india.gov.in';
  const trackingUrl = meta.tracking_portal_url || url;
  const verifiedOn = meta.last_verified_on || '2026-08-20';
  const deadlineType = meta.deadline_type || 'rolling';

  // 1. POST_SUBMISSION Intent
  if (intent === 'POST_SUBMISSION') {
    let resp = `### What Happens After Submitting for [${schemeName}](${url})\n\n`;
    resp += `Once your application is submitted on the official portal, it goes through the following verification lifecycle:\n\n`;
    resp += `1. **Digital Acknowledgment & ID:**\n`;
    resp += `   - You receive an **Application Reference Number** and SMS confirmation immediately.\n\n`;
    resp += `2. **Institutional / District Scrutiny:**\n`;
    resp += `   - Nodal verification by the District Industries Centre (DIC) / College Principal / Taluk Committee (typically 7–21 working days).\n\n`;
    resp += `3. **Defect & Correction Window:**\n`;
    resp += `   - If any uploaded document is unclear or disputed, status updates to *"Defective / Sent Back for Correction"*. You will have 7–15 days to re-upload on the portal.\n\n`;
    resp += `4. **Sanction Order Issuance:**\n`;
    resp += `   - The department publishes the official sanction list and generates your sanction order.\n\n`;
    resp += `5. **Direct Electronic Disbursement:**\n`;
    resp += `   - Funds or subsidies are released directly through PFMS into your Aadhaar-seeded bank account.\n\n`;
    resp += `You can monitor live milestone updates on the [${schemeName} Tracking Portal](${trackingUrl}).`;
    return resp;
  }

  // 2. FORM_FILLING_HELP Intent
  if (intent === 'FORM_FILLING_HELP') {
    let resp = `### Form-Filling Field Guidance for [${schemeName}](${url})\n\n`;
    resp += `**Key Form Fields & Official Conventions:**\n\n`;
    resp += `1. **Annual Family Income:**\n`;
    resp += `   - **[General Form Guidance]:** Always enter **Gross Annual Family Income** (before taxes and deductions) exactly matching your officially issued Tahsildar/Revenue Income Certificate.\n\n`;
    resp += `2. **Bank Account Details:**\n`;
    resp += `   - **[General Form Guidance]:** Provide an active, single-holder savings account seeded with your Aadhaar number (NPCI mapped) for Direct Benefit Transfer.\n\n`;
    resp += `3. **Name & Date of Birth:**\n`;
    resp += `   - Ensure your name matches your Aadhaar card and educational marksheets character-for-character.\n\n`;
    resp += `4. **Community / Category Details:**\n`;
    resp += `   - Enter your exact sub-caste and certificate number from your state community certificate.\n\n`;

    if (unverifiedDocs && unverifiedDocs.length > 0) {
      resp += `⚠️ **Profile Document Alert:** You currently have unverified certificates (${unverifiedDocs.join(', ')}) in your profile. Verify them in [Doc Check](/profile) first to avoid form rejection.\n\n`;
    }

    resp += `Direct application portal: [${schemeName} Application Portal](${url}).`;
    return resp;
  }

  // 3. DEADLINE Intent
  if (intent === 'DEADLINE') {
    let resp = `### [${schemeName}](${url}) — Application Deadlines & Schedule\n\n`;
    if (deadlineType === 'fixed_annual') {
      resp += `**Application Intake Window:** **Fixed Annual Academic Cycle** (Typically opens July/August and closes **October 31 annually**, subject to state/central notification extensions).\n\n`;
    } else {
      resp += `**Application Intake Window:** **Year-Round Open Rolling Intake** (Applications accepted and processed continuously).\n\n`;
    }
    resp += `📅 **Last verified on:** ${verifiedOn}. Always verify live active dates on [${schemeName} Official Portal](${url}) before submission.\n\n`;
    resp += `*Note: Departments may issue notification extensions on the official portal.*`;
    return resp;
  }

  // 4. HOW_TO_APPLY Intent
  if (intent === 'HOW_TO_APPLY') {
    let resp = `### How to Apply for [${schemeName}](${url})\n\n`;
    resp += `**Official Application Procedure:**\n`;
    resp += `1. **Portal Registration:** Register on [${schemeName} Portal](${url}) with your mobile number and Aadhaar.\n`;
    resp += `2. **Fill Academic / Enterprise Details:** Enter educational, income, or business details as required.\n`;
    resp += `3. **Attach Verified Documents:** Upload mandatory proofs (Income Certificate, Marksheets/Registration, Bank Passbook).\n`;
    resp += `4. **Nodal Verification:** Application is electronically evaluated by designated department committee.\n`;
    resp += `5. **Sanction & Benefit Credit:** Sanctioned grant or subsidy is disbursed.\n\n`;
    resp += `Official Portal: [${schemeName} Portal](${url}).`;
    return resp;
  }

  // 5. APPLICATION_TRACKING Intent
  if (intent === 'APPLICATION_TRACKING') {
    let resp = `### Application Tracking for [${schemeName}](${trackingUrl})\n\n`;
    resp += `*Notice: GovAssist AI cannot query internal government databases directly for live individual records. Here is how you can track it officially:*\n\n`;
    resp += `**How to Track Your Status:**\n`;
    resp += `1. Visit the official tracking portal: [${schemeName} Tracking Portal](${trackingUrl}).\n`;
    resp += `2. Enter your **Application Reference Number / Student ID** and registered mobile number.\n`;
    resp += `3. Complete OTP authentication to view live scrutiny status.\n\n`;
    resp += `**Status Code Meanings:**\n`;
    resp += `- **Under Scrutiny / Review:** Document verification in progress.\n`;
    resp += `- **Defective / Sent Back:** Unclear document requires correction; re-upload promptly.\n`;
    resp += `- **Approved for DBT:** Sanctioned; awaiting treasury release.`;
    return resp;
  }

  // 6. Default / Eligibility Overview
  let resp = `### [${schemeName}](${url})\n\n`;
  resp += `**Estimated Benefit:** ${benefit}\n\n`;

  if (userProfile && (userProfile.age || userProfile.education)) {
    resp += `**Personalized Eligibility Breakdown:**\n`;
    resp += `- **Age:** ${meta.min_age && meta.min_age > 0 ? `${meta.min_age}–${meta.max_age || '∞'} yrs` : 'Any age'} (Your age: ${userProfile.age || 'N/A'}).\n`;
    resp += `- **Education:** ${meta.education_min || 'Open'} (Your qualification: ${userProfile.education || 'N/A'}).\n`;
    resp += `- **Family Income:** ${meta.max_family_income && meta.max_family_income > 0 ? `≤ ₹${Number(meta.max_family_income).toLocaleString('en-IN')}` : 'No Cap'}.\n\n`;
  } else {
    resp += `**Key Criteria:**\n`;
    resp += `- **Age Boundary:** ${meta.min_age && meta.min_age > 0 ? `${meta.min_age}–${meta.max_age || '∞'} yrs` : 'Any Age'}\n`;
    resp += `- **Education:** ${meta.education_min || 'Open qualification'}\n`;
    resp += `- **Income Limit:** ${meta.max_family_income && meta.max_family_income > 0 ? `≤ ₹${Number(meta.max_family_income).toLocaleString('en-IN')}` : 'No Limit'}\n\n`;
  }

  resp += `📅 **Application Window:** ${meta.deadline_type === 'fixed_annual' ? 'Fixed Annual Cycle (Opens July/Aug)' : 'Open Year-round Rolling Intake'} *(Verified: ${verifiedOn})*.\n\n`;
  resp += `Official Portal: [${schemeName} Official Application Portal](${url}).`;
  return resp;
}

/**
 * Save chat log to database
 */
async function saveChatLog({ userId, sessionId, role, message, sources = [], isPersonalized = false, activeSchemeId = null }) {
  try {
    await pool.query(
      `INSERT INTO chat_logs (user_id, session_id, role, message, sources, is_personalized, active_scheme_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId || null, sessionId, role, message, JSON.stringify(sources), isPersonalized, activeSchemeId]
    );
  } catch (err) {
    console.error('Error saving chat log:', err.message);
  }
}

/**
 * Save feedback
 */
async function saveFeedback(messageId, rating, comment = '') {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);
    if (isUuid) {
      await pool.query(
        `UPDATE chat_logs SET feedback_rating = $1, feedback_comment = $2 WHERE id = $3`,
        [rating, comment, messageId]
      );
    }
    return true;
  } catch (err) {
    console.error('Error saving feedback:', err.message);
    return false;
  }
}

/**
 * Delete chat history
 */
async function deleteChatHistory(sessionId, userId = null) {
  try {
    if (userId) {
      await pool.query('DELETE FROM chat_logs WHERE user_id = $1 OR session_id = $2', [userId, sessionId]);
    } else if (sessionId) {
      await pool.query('DELETE FROM chat_logs WHERE session_id = $1', [sessionId]);
    }
    return true;
  } catch (err) {
    console.error('Error deleting chat history:', err.message);
    return false;
  }
}

/**
 * Get chat history
 */
async function getChatHistory(sessionId, userId = null, limit = 20) {
  try {
    let query = `SELECT id, role, message, sources, is_personalized, active_scheme_id, feedback_rating, created_at FROM chat_logs WHERE session_id = $1`;
    const params = [sessionId];

    if (userId) {
      query += ` OR user_id = $2`;
      params.push(userId);
    }

    query += ` ORDER BY created_at ASC LIMIT $${params.length + 1};`;
    params.push(limit);

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
  saveFeedback,
  deleteChatHistory,
  getChatHistory,
};
