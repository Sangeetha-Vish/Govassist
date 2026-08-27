const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

/**
 * Robust OCR & Document Parser
 * Handles native text PDFs, scanned/image PDFs, and image uploads (JPG/PNG).
 * Leverages Gemini Vision for low/mid quality scans and OCR extraction.
 */
async function parseDocument(file, expectedType = "") {
  const isPdf = file.mimetype === "application/pdf" || (file.originalname || "").toLowerCase().endsWith(".pdf");
  let text = "";
  let info = {};
  let numPages = 1;
  let source = "unknown";

  // 1. If PDF, try fast native text extraction first
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

  // 2. If text is sparse (< 30 characters) or file is an image, use Gemini Vision OCR
  const needsAiOcr = !text || text.length < 30 || !isPdf;

  if (needsAiOcr && GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      const prompt = `You are a high-accuracy government document OCR and verification assistant.
Analyze this uploaded document (${expectedType || "official document/marksheet/certificate"}).
Transcribe all readable text from this document accurately, including:
- Document Title / Heading
- Issuing Authority / Board / Department / Institution
- Candidate / Applicant / Person Name
- Identification Numbers (Roll No, Registration No, Certificate No, PAN, Aadhaar, EPIC No)
- Dates (Date of Birth, Issue Date, Passing Year)
- Marks / Result / Status (Pass, Percentage, Grade, Income Amount)
- All visible details, even if slightly noisy or low resolution.

Please output the complete extracted transcription clearly.`;

      const imagePart = {
        inlineData: {
          data: file.buffer.toString("base64"),
          mimeType: file.mimetype || (isPdf ? "application/pdf" : "image/jpeg")
        }
      };

      const result = await model.generateContent([prompt, imagePart]);
      const aiResponse = result.response.text();

      if (aiResponse && aiResponse.trim().length > 10) {
        // Merge or replace with AI text
        text = text ? `${text}\n\n${aiResponse}` : aiResponse;
        source = "gemini-ocr";
        info = { ...info, ocr_engine: "gemini-1.5-flash" };
      }
    } catch (geminiErr) {
      console.warn("Gemini Vision OCR error:", geminiErr.message);
    }
  }

  return {
    text: text || "",
    info,
    numPages: Math.max(1, numPages),
    source
  };
}

module.exports = { parseDocument };
