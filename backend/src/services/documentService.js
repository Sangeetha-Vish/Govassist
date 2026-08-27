/**
 * Document Service — Pipeline Orchestrator
 * Replaces the previous monolithic processDocument function.
 * Runs each stage in sequence, short-circuiting on failure.
 */

const pdfParse = require("pdf-parse");
const pool = require("../../config/db");
const { DOCUMENT_RULES, getValidDocumentTypes } = require("./documentRules");

// Pipeline stages
const uploadValidator = require("./document/uploadValidator");
const ocrService = require("./document/ocrService");
const qualityChecker = require("./document/qualityChecker");
const typeClassifier = require("./document/typeClassifier");
const fieldExtractor = require("./document/fieldExtractor");
const fieldValidator = require("./document/fieldValidator");
const fraudDetector = require("./document/fraudDetector");
const decisionEngine = require("./document/decisionEngine");

async function processDocument(userId, file, documentType, authHeader) {
  const stageResults = {};
  let filePath = `${userId}/${Date.now()}_${file.originalname}`;

  try {
    // ─── STAGE 1: Upload Validation ───
    const uploadResult = uploadValidator.validate(file);
    stageResults.upload = { pass: uploadResult.pass, code: uploadResult.code };
    if (!uploadResult.pass) {
      return { success: false, userMessage: uploadResult.userMessage, code: uploadResult.code, stageResults };
    }

    // Validate document type is in our known list
    if (!getValidDocumentTypes().includes(documentType)) {
      return {
        success: false,
        userMessage: "Please select a valid document type from the list.",
        code: "INVALID_TYPE",
        stageResults
      };
    }

    // ─── STAGE 2: Text & OCR Extraction (Supports Native PDF, Scanned PDF, Images) ───
    const ocrResult = await ocrService.parseDocument(file, documentType);
    const text = ocrResult.text || "";
    const info = ocrResult.info || {};
    stageResults.extraction = { pass: true, code: "OK", source: ocrResult.source };

    // ─── STAGE 3: Quality Check ───
    const qualityResult = qualityChecker.check({ text, numpages: ocrResult.numPages });
    stageResults.quality = { pass: qualityResult.pass, code: qualityResult.code, data: qualityResult.data };

    if (!qualityResult.pass) {
      // If quality is too low to parse automatically, still save for admin manual review
      await uploadToStorage(filePath, file, authHeader);
      const doc = await insertDocument(
        userId,
        documentType,
        filePath,
        "manual_review_required",
        {},
        stageResults,
        qualityResult.userMessage
      );
      return {
        success: true,
        document: doc,
        userMessage: "Document uploaded. Because the scan quality is low, it has been queued for manual admin verification.",
        code: "MANUAL_REVIEW_QUEUED",
        stageResults
      };
    }

    // ─── STAGE 4: Type Classification ───
    const classifyResult = typeClassifier.classify(text, documentType);
    stageResults.classification = { pass: classifyResult.pass, code: classifyResult.code };
    
    if (!classifyResult.pass) {
      // If classification failed but some text is present, route to manual review rather than dropping
      await uploadToStorage(filePath, file, authHeader);
      const doc = await insertDocument(
        userId,
        documentType,
        filePath,
        "manual_review_required",
        {},
        stageResults,
        classifyResult.userMessage
      );
      return {
        success: true,
        document: doc,
        userMessage: classifyResult.userMessage || "Document sent for manual admin review.",
        code: classifyResult.code || "MANUAL_REVIEW_QUEUED",
        stageResults
      };
    }

    // ─── STAGE 5: Field Extraction ───
    const extractResult = fieldExtractor.extract(text, documentType);
    stageResults.extraction_fields = { pass: extractResult.pass, code: extractResult.code, data: extractResult.data?.extractionLog };
    const extractedFields = extractResult.data?.extracted || {};

    // ─── STAGE 6: Field Validation & Contradiction Detection ───
    // Fetch existing documents for duplicate and consistency check
    let existingDocs = [];
    try {
      const existingRes = await pool.query(
        `SELECT document_type, verification_status, extracted_data FROM documents WHERE user_id = $1`,
        [userId]
      );
      existingDocs = existingRes.rows;
    } catch (e) {
      console.warn("Could not fetch existing docs for consistency check:", e.message);
    }

    const fieldValidResult = fieldValidator.validate(extractedFields, documentType, text, existingDocs);
    stageResults.validation = { pass: fieldValidResult.pass, code: fieldValidResult.code, data: fieldValidResult.data };

    // ─── STAGE 7: Fraud Detection ───
    const fraudResult = fraudDetector.detect(text, info, documentType, existingDocs, ocrResult.aiMetadata);
    stageResults.fraud = { pass: fraudResult.pass, code: fraudResult.code, data: fraudResult.data };

    // If fraud check returned a hard failure (LIKELY_FORGED)
    if (!fraudResult.pass) {
      // Still upload to storage for admin review
      await uploadToStorage(filePath, file, authHeader);

      const doc = await insertDocument(userId, documentType, filePath, "rejected_forged", extractedFields, stageResults, fraudResult.userMessage);

      return {
        success: true,
        document: doc,
        userMessage: fraudResult.userMessage,
        code: fraudResult.code,
        stageResults
      };
    }

    // ─── STAGE 8: Decision ───
    const decision = decisionEngine.decide({
      fieldValidation: fieldValidResult,
      fraudDetection: fraudResult,
      extractedFields,
      documentType
    });
    stageResults.decision = { status: decision.status, reason: decision.data?.reason };

    // ─── Upload to Supabase Storage ───
    await uploadToStorage(filePath, file, authHeader);

    // ─── Database Insert ───
    const doc = await insertDocument(userId, documentType, filePath, decision.status, extractedFields, stageResults, decision.data?.reason);

    // ─── Auto-update profile if verified ───
    if (decision.status === "verified") {
      await autoUpdateProfile(userId, extractedFields, documentType);
    }

    return {
      success: true,
      document: doc,
      userMessage: decision.userMessage,
      code: "OK",
      stageResults
    };

  } catch (error) {
    console.error("Document processing pipeline error:", error);
    return {
      success: false,
      userMessage: "Something went wrong while checking your document. Please try again. If the problem continues, you can upload the document again later.",
      code: "INTERNAL_ERROR",
      stageResults
    };
  }
}

// ─── Helpers ───

async function uploadToStorage(filePath, file, authHeader) {
  const supabaseUrl = process.env.SUPABASE_URL || "https://ilznvhcabsrbyarrgyhl.supabase.co";
  const effectiveAuth = authHeader || (process.env.SUPABASE_SERVICE_ROLE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY.trim()}` : undefined);
  const headers = {
    'Content-Type': file.mimetype
  };
  if (effectiveAuth) {
    headers['Authorization'] = effectiveAuth;
  }
  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/citizen_documents/${filePath}`, {
    method: 'POST',
    headers,
    body: file.buffer
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error("Supabase upload error:", uploadRes.status, errText);
    throw new Error("Storage upload failed");
  }
}

async function insertDocument(userId, documentType, filePath, status, extractedData, validationResults, rejectionReason) {
  const insertQuery = `
    INSERT INTO documents (user_id, document_type, file_path, verification_status, extracted_data, validation_results, rejection_reason)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const result = await pool.query(insertQuery, [
    userId,
    documentType,
    filePath,
    status,
    JSON.stringify(extractedData),
    JSON.stringify(validationResults),
    rejectionReason || null
  ]);
  return result.rows[0];
}

async function autoUpdateProfile(userId, extractedFields, documentType) {
  try {
    if (documentType === "income_certificate" && extractedFields.income_amount) {
      await pool.query(`UPDATE profiles SET family_income = $1, updated_at = NOW() WHERE user_id = $2`, [extractedFields.income_amount, userId]);
    } else if (documentType === "degree" && extractedFields.degree_name) {
      await pool.query(`UPDATE profiles SET education = $1, updated_at = NOW() WHERE user_id = $2`, [extractedFields.degree_name, userId]);
    } else if (documentType === "diploma" && extractedFields.course) {
      await pool.query(`UPDATE profiles SET education = $1, updated_at = NOW() WHERE user_id = $2`, [extractedFields.course, userId]);
    } else if (documentType === "marksheet_12") {
      await pool.query(`UPDATE profiles SET education = '12th Standard / Higher Secondary', updated_at = NOW() WHERE user_id = $2`, [userId]);
    } else if (documentType === "marksheet_10") {
      await pool.query(`UPDATE profiles SET education = '10th Standard / Matriculation', updated_at = NOW() WHERE user_id = $2`, [userId]);
    }
  } catch (err) {
    console.warn("Failed to auto-update profile after verification:", err.message);
  }
}

module.exports = { processDocument };
