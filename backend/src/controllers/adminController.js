const pool = require("../../config/db");

// Document type labels for admin display
const DOC_TYPE_LABELS = {
  pan: "PAN Card",
  aadhaar: "Aadhaar Card",
  voter_id: "Voter ID",
  income_certificate: "Income Certificate",
  marksheet_10: "10th Marksheet",
  marksheet_12: "12th Marksheet",
  diploma: "Diploma Certificate",
  degree: "Degree Certificate",
  // Legacy types
  income: "Income Certificate (legacy)",
  identity: "Identity Proof (legacy)",
  marksheet: "Marksheet (legacy)"
};

// 1. Fetch pending documents
exports.getPendingDocuments = async (req, res, next) => {
  try {
    const query = `
      SELECT d.*, p.email, p.category, p.age, p.location
      FROM documents d
      LEFT JOIN profiles p ON d.user_id = p.user_id
      WHERE d.verification_status IN ('manual_review_required', 'pending', 'rejected_forged', 'rejected')
      ORDER BY d.created_at DESC;
    `;
    const result = await pool.query(query);

    // Enrich with readable labels
    const enriched = result.rows.map(doc => ({
      ...doc,
      document_type_label: DOC_TYPE_LABELS[doc.document_type] || doc.document_type
    }));

    res.status(200).json({
      success: true,
      data: enriched,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Review document
exports.reviewDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { status, adminNotes } = req.body;

    if (!['verified', 'rejected_forged', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    // Update document status
    const updateQuery = `
      UPDATE documents
      SET verification_status = $1, admin_notes = $2
      WHERE id = $3
      RETURNING *;
    `;
    
    const result = await pool.query(updateQuery, [status, adminNotes, documentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }
    
    const doc = result.rows[0];

    // If verified, auto-update profile with extracted data if available
    if (status === 'verified' && doc.extracted_data) {
      try {
        const extractedData = doc.extracted_data;
        if (doc.document_type === 'income_certificate' && (extractedData.family_income || extractedData.income_amount)) {
          const income = extractedData.income_amount || extractedData.family_income;
          await pool.query(`UPDATE profiles SET family_income = $1, updated_at = NOW() WHERE user_id = $2`, [income, doc.user_id]);
        } else if (doc.document_type === 'degree' && extractedData.degree_name) {
          await pool.query(`UPDATE profiles SET education = $1, updated_at = NOW() WHERE user_id = $2`, [extractedData.degree_name, doc.user_id]);
        } else if (doc.document_type === 'diploma' && extractedData.course) {
          await pool.query(`UPDATE profiles SET education = $1, updated_at = NOW() WHERE user_id = $2`, [extractedData.course, doc.user_id]);
        } else if (doc.document_type === 'marksheet_12') {
          await pool.query(`UPDATE profiles SET education = '12th Standard / Higher Secondary', updated_at = NOW() WHERE user_id = $1`, [doc.user_id]);
        } else if (doc.document_type === 'marksheet_10') {
          await pool.query(`UPDATE profiles SET education = '10th Standard / Matriculation', updated_at = NOW() WHERE user_id = $1`, [doc.user_id]);
        }
      } catch (err) {
        console.warn("Failed to auto-update profile after admin verification", err);
      }
    }

    res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Secure Document Proxy for Admin Preview
exports.downloadDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    
    // Fetch document path from DB
    const docRes = await pool.query(`SELECT file_path FROM documents WHERE id = $1`, [documentId]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }
    
    const filePath = docRes.rows[0].file_path;
    const supabaseUrl = process.env.SUPABASE_URL || "https://ilznvhcabsrbyarrgyhl.supabase.co";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!serviceKey) {
      return res.status(500).json({ success: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the backend. Cannot bypass RLS to preview document." });
    }

    const fileUrl = `${supabaseUrl}/storage/v1/object/citizen_documents/${filePath}`;
    
    const response = await fetch(fileUrl, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: "Failed to fetch document from Supabase Storage" });
    }

    // Determine Content-Type based on file extension
    const ext = filePath.split('.').pop().toLowerCase();
    let contentType = 'application/pdf';
    if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
    else if (ext === 'png') contentType = 'image/png';
    else if (ext === 'webp') contentType = 'image/webp';

    // Set appropriate headers for preview
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');

    // Pipe the fetch response body to the Express response stream
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
    
  } catch (error) {
    next(error);
  }
};
