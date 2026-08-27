const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro"; // Upgraded to Pro for complex docs

/**
 * Smart image preprocessing for better OCR
 * Resizes huge images, normalizes contrast, and sharpens to improve text clarity.
 */
async function preprocessImage(fileBuffer) {
  try {
    return await sharp(fileBuffer)
      .resize({ width: 2000, withoutEnlargement: true }) // Prevent massive images hitting payload limits
      .normalize() // Enhance contrast dynamically
      .sharpen() // Sharpen edges for clearer text
      .jpeg({ quality: 85 }) // Compress slightly to save bandwidth
      .toBuffer();
  } catch (err) {
    console.warn("Sharp preprocessing failed, using original buffer:", err.message);
    return fileBuffer;
  }
}

/**
 * Robust OCR & Document Parser
 * Handles native text PDFs, scanned/image PDFs, and image uploads (JPG/PNG).
 * Leverages Gemini 1.5 Pro for poor-quality scans, Tamil/English, and visual analysis.
 */
async function parseDocument(file, expectedType = "") {
  const isPdf = file.mimetype === "application/pdf" || (file.originalname || "").toLowerCase().endsWith(".pdf");
  let text = "";
  let info = {};
  let numPages = 1;
  let source = "unknown";
  let aiMetadata = null;

  // 1. Native PDF Extraction (Fast path)
  if (isPdf) {
    try {
      const pdfData = await pdfParse(file.buffer);
      text = (pdfData.text || "").trim();
      info = pdfData.info || {};
      numPages = pdfData.numpages || 1;
      source = "pdf-parse";
    } catch (e) {
      console.warn("pdf-parse extraction failed, falling back to AI Vision OCR:", e.message);
    }
  }

  // 2. AI Vision OCR (Fallback for images, scanned PDFs, or sparse text)
  const needsAiOcr = !text || text.length < 50 || !isPdf;

  if (needsAiOcr && GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      let processBuffer = file.buffer;
      let mimeType = file.mimetype || (isPdf ? "application/pdf" : "image/jpeg");

      if (!isPdf) {
        processBuffer = await preprocessImage(file.buffer);
        mimeType = "image/jpeg"; // Sharp outputs jpeg
      }

      const prompt = `You are a high-accuracy government document OCR and visual verification assistant.
Analyze this uploaded document (${expectedType || "official document"}).
The document may be in English, Tamil, or mixed. It may be blurry, rotated, cropped, or low resolution.

Please provide a JSON response with the following structure:
{
  "text": "The complete, accurate transcription of all readable text in the document. Correct obvious OCR typos (like 0 vs O) but do NOT invent missing data. Extract all identification numbers, names, dates, and marks.",
  "quality": {
    "is_blurry": boolean (true if the text is severely blurred making critical fields unreadable),
    "is_cropped": boolean (true if edges of the document are cut off),
    "is_unreadable": boolean (true if the document is too dark, corrupted, or low-res to extract anything meaningful),
    "language": "string (e.g. 'English', 'Tamil', 'Mixed')"
  },
  "tampering_signals": ["List any visual signs of tampering, such as mismatched fonts, digital white boxes over text, or pasted photos. Empty array if none."]
}

Respond ONLY with valid JSON. Do not use markdown blocks.`;

      const documentPart = {
        inlineData: {
          data: processBuffer.toString("base64"),
          mimeType: mimeType
        }
      };

      const result = await model.generateContent([prompt, documentPart]);
      let aiResponse = result.response.text();
      
      // Clean up markdown formatting if the model accidentally included it
      aiResponse = aiResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      const parsedResponse = JSON.parse(aiResponse);

      if (parsedResponse.text && parsedResponse.text.trim().length > 10) {
        text = text ? `${text}\n\n${parsedResponse.text}` : parsedResponse.text;
        source = "gemini-1.5-pro";
        info = { ...info, ocr_engine: "gemini-1.5-pro" };
        aiMetadata = {
          quality: parsedResponse.quality,
          tampering_signals: parsedResponse.tampering_signals
        };
      } else if (parsedResponse.quality && parsedResponse.quality.is_unreadable) {
        // If it's explicitly unreadable and returned no text
        aiMetadata = {
          quality: parsedResponse.quality,
          tampering_signals: parsedResponse.tampering_signals || []
        };
      }
    } catch (geminiErr) {
      console.warn("Gemini Vision OCR error:", geminiErr.message);
    }
  }

  return {
    text: text || "",
    info,
    numPages: Math.max(1, numPages),
    source,
    aiMetadata // Contains quality and tampering signals if AI was used
  };
}

module.exports = { parseDocument };
