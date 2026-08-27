const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";

// Hard cap for base64 payload sent to Gemini (~4MB encoded = ~3MB raw)
const MAX_AI_PAYLOAD_BYTES = 3 * 1024 * 1024;

/**
 * Smart image preprocessing — resize, normalize contrast, sharpen.
 * Also enforces a strict size cap so we never send huge payloads to Gemini.
 */
async function preprocessImage(fileBuffer) {
  try {
    // First pass: resize + normalize + sharpen
    let processed = await sharp(fileBuffer)
      .resize({ width: 1600, withoutEnlargement: true })
      .normalize()
      .sharpen()
      .jpeg({ quality: 80 })
      .toBuffer();

    // If still too large, reduce quality further until under cap
    let quality = 70;
    while (processed.length > MAX_AI_PAYLOAD_BYTES && quality >= 40) {
      processed = await sharp(fileBuffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .normalize()
        .jpeg({ quality })
        .toBuffer();
      quality -= 15;
    }

    return processed;
  } catch (err) {
    console.warn("Sharp preprocessing failed, using original buffer:", err.message);
    return fileBuffer;
  }
}

/**
 * Call Gemini with a timeout wrapper.
 * The stream-reading error (wsarecv) happens when a large payload stalls.
 * We use Promise.race to abort after 30 seconds and return null gracefully.
 */
async function callGeminiWithTimeout(model, parts, timeoutMs = 30000) {
  const geminiPromise = model.generateContent(parts);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Gemini request timed out")), timeoutMs)
  );
  return Promise.race([geminiPromise, timeoutPromise]);
}

/**
 * Robust OCR & Document Parser
 * Stage 1: Fast native pdf-parse for text PDFs
 * Stage 2: Sharp preprocessing + Gemini Vision for images/scanned PDFs
 * Falls back gracefully on any network error — never crashes the pipeline.
 */
async function parseDocument(file, expectedType = "") {
  const isPdf =
    file.mimetype === "application/pdf" ||
    (file.originalname || "").toLowerCase().endsWith(".pdf");
  let text = "";
  let info = {};
  let numPages = 1;
  let source = "unknown";
  let aiMetadata = null;

  // ── STAGE 1: Native PDF text extraction (fast, zero network) ──
  if (isPdf) {
    try {
      const pdfData = await pdfParse(file.buffer);
      text = (pdfData.text || "").trim();
      info = pdfData.info || {};
      numPages = pdfData.numpages || 1;
      source = "pdf-parse";
    } catch (e) {
      console.warn("pdf-parse failed:", e.message);
    }
  }

  // ── STAGE 2: AI Vision OCR — only when needed and payload is safe ──
  const needsAiOcr = !text || text.length < 50 || !isPdf;

  if (!needsAiOcr) {
    // Native PDF text was good — skip AI entirely for speed
    return { text, info, numPages: Math.max(1, numPages), source, aiMetadata };
  }

  if (!GEMINI_API_KEY) {
    return { text, info, numPages: Math.max(1, numPages), source, aiMetadata };
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    let processBuffer = file.buffer;
    let mimeType = file.mimetype || (isPdf ? "application/pdf" : "image/jpeg");

    // Preprocess images to reduce payload size and improve quality
    if (!isPdf) {
      processBuffer = await preprocessImage(file.buffer);
      mimeType = "image/jpeg";
    }

    // Safety check: if payload is still too large for Gemini, skip AI
    if (processBuffer.length > MAX_AI_PAYLOAD_BYTES) {
      console.warn(
        `Payload too large for Gemini (${Math.round(processBuffer.length / 1024)}KB), skipping AI OCR`
      );
      return { text, info, numPages: Math.max(1, numPages), source, aiMetadata };
    }

    const prompt = `You are a high-accuracy government document OCR and visual verification assistant.
Analyze this uploaded document (${expectedType || "official government document"}).
The document may be in English, Tamil, or mixed language. It may be blurry, rotated, cropped, or low resolution.

Return a single valid JSON object (no markdown, no extra text):
{
  "text": "Complete accurate transcription of ALL readable text. Fix obvious OCR typos like 0->O but do NOT invent missing data.",
  "quality": {
    "is_blurry": false,
    "is_cropped": false,
    "is_unreadable": false,
    "is_non_document": false,
    "language": "English"
  },
  "tampering_signals": []
}

For quality flags:
- is_blurry: true only if critical fields are unreadable due to blur
- is_unreadable: true only if the document is too dark/corrupted to extract anything meaningful
- is_non_document: true if this is a photo, selfie, anime image, scenery, or any non-document image
- tampering_signals: list specific signals like "mismatched font in date field" or "white box overlay on signature area". Empty array if none.`;

    const documentPart = {
      inlineData: {
        data: processBuffer.toString("base64"),
        mimeType,
      },
    };

    const result = await callGeminiWithTimeout(model, [prompt, documentPart], 30000);
    let aiResponse = result.response.text();

    // Strip any accidental markdown code fences
    aiResponse = aiResponse
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsedResponse = JSON.parse(aiResponse);

    // Only use AI text if it actually extracted something meaningful
    if (parsedResponse.text && parsedResponse.text.trim().length > 10) {
      text = text
        ? `${text}\n\n${parsedResponse.text}`
        : parsedResponse.text;
      source = "gemini-1.5-pro";
      info = { ...info, ocr_engine: "gemini-1.5-pro" };
    }

    // Always capture quality/tamper metadata if present
    aiMetadata = {
      quality: parsedResponse.quality || {},
      tampering_signals: parsedResponse.tampering_signals || [],
    };
  } catch (geminiErr) {
    // Network errors (wsarecv, timeout, etc.) are non-fatal — pipeline continues with native text
    console.warn("Gemini Vision OCR error (non-fatal):", geminiErr.message);
    // aiMetadata stays null — downstream stages handle this gracefully
  }

  return {
    text: text || "",
    info,
    numPages: Math.max(1, numPages),
    source,
    aiMetadata,
  };
}

module.exports = { parseDocument };
