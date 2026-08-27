/**
 * Document Validation Rules & Understanding Configuration
 * Defines target types, non-target categories, positive markers, negative indicators,
 * structural requirements, patterns, and field extractors.
 */

const DOCUMENT_RULES = {
  pan: {
    label: "PAN Card",
    category: "identity",
    mandatoryKeywords: ["permanent account number", "income tax department", "pan card", "govt. of india", "government of india"],
    structuralIndicators: ["father's name", "date of birth", "signature", "photo", "income tax"],
    disqualifiers: [
      "unique identification", "uidai", "aadhaar", "aadhar",
      "election commission", "voter id", "epic",
      "bonafide", "undertaking", "declaration", "marksheet", "degree certificate", "income certificate", "semester"
    ],
    requiredFields: ["pan_number"],
    patterns: {
      pan_number: {
        regex: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
        description: "10-character alphanumeric PAN format (e.g. ABCDE1234F)"
      }
    },
    officialMarkers: ["government of india", "income tax department", "income tax", "dept. of revenue", "national securities depository", "uti infrastructure"],
    fieldExtractors: {
      pan_number: (text) => {
        const match = text.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
        return match ? match[0] : null;
      },
      name: (text) => {
        const nameMatch = text.match(/(?:name|shri|smt|mr|mrs|ms)\s*[:\-]?\s*([A-Z][A-Z\s]+)/i);
        return nameMatch ? nameMatch[1].trim() : null;
      },
      dob: (text) => {
        const dobMatch = text.match(/(?:date\s*of\s*birth|dob|d\.o\.b)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
        return dobMatch ? dobMatch[1] : null;
      }
    },
    profileFields: {}
  },

  aadhaar: {
    label: "Aadhaar Card",
    category: "identity",
    mandatoryKeywords: ["unique identification authority", "uidai", "aadhaar", "aadhar", "mera aadhaar", "enrollment no"],
    structuralIndicators: ["government of india", "to:", "address:", "dob:", "year of birth", "help@uidai.gov.in", "my aadhaar"],
    disqualifiers: [
      "permanent account number", "income tax department",
      "election commission of india", "epic no",
      "bonafide", "undertaking", "declaration", "marksheet", "degree certificate", "income certificate", "semester"
    ],
    requiredFields: ["aadhaar_number"],
    patterns: {
      aadhaar_number: {
        regex: /^\d{12}$/,
        description: "12-digit numeric Aadhaar number"
      }
    },
    officialMarkers: ["unique identification authority", "uidai", "government of india", "aadhaar", "my aadhaar"],
    fieldExtractors: {
      aadhaar_number: (text) => {
        const match = text.match(/\d{4}\s?\d{4}\s?\d{4}/);
        return match ? match[0].replace(/\s/g, '') : null;
      },
      name: (text) => {
        const nameMatch = text.match(/(?:name|shri|smt|mr|mrs|ms|to[:\s]+)\s*[:\-]?\s*([A-Z][A-Z\s]+)/i);
        return nameMatch ? nameMatch[1].trim() : null;
      },
      dob: (text) => {
        const dobMatch = text.match(/(?:date\s*of\s*birth|dob|d\.o\.b|year\s*of\s*birth|yob)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4})/i);
        return dobMatch ? dobMatch[1] : null;
      },
      address: (text) => {
        const addrMatch = text.match(/(?:address)\s*[:\-]?\s*([\s\S]{10,120}?)(?:\n\n|\d{4}\s?\d{4}|\baadhaar\b)/i);
        return addrMatch ? addrMatch[1].trim().replace(/\n/g, ', ') : null;
      }
    },
    profileFields: {}
  },

  voter_id: {
    label: "Voter ID",
    category: "identity",
    mandatoryKeywords: ["election commission of india", "election commission", "elector photo identity", "elector's photo identity", "epic", "voter id"],
    structuralIndicators: ["assembly constituency", "elector's name", "father's name", "electoral registration officer", "polling station"],
    disqualifiers: [
      "permanent account number", "income tax department",
      "unique identification authority", "uidai", "aadhaar",
      "bonafide", "undertaking", "declaration", "marksheet", "degree certificate", "income certificate"
    ],
    requiredFields: ["epic_number"],
    patterns: {
      epic_number: {
        regex: /^[A-Z]{3}\d{7}$/,
        description: "EPIC number format (e.g. ABC1234567)"
      }
    },
    officialMarkers: ["election commission of india", "election commission", "electoral", "electoral registration officer"],
    fieldExtractors: {
      epic_number: (text) => {
        const match = text.match(/[A-Z]{3}\d{7}/);
        return match ? match[0] : null;
      },
      name: (text) => {
        const nameMatch = text.match(/(?:name|elector'?s?\s*name)\s*[:\-]?\s*([A-Z][A-Z\s]+)/i);
        return nameMatch ? nameMatch[1].trim() : null;
      },
      dob: (text) => {
        const dobMatch = text.match(/(?:date\s*of\s*birth|dob|age)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,3})/i);
        return dobMatch ? dobMatch[1] : null;
      }
    },
    profileFields: {}
  },

  income_certificate: {
    label: "Income Certificate",
    category: "income",
    mandatoryKeywords: ["income certificate", "revenue department", "tahsildar", "taluk", "annual family income", "annual income", "income is rs", "income is ₹"],
    structuralIndicators: ["district collector", "revenue inspector", "village administrative officer", "taluk office", "certified that", "applicant"],
    disqualifiers: [
      "bonafide certificate", "undertaking", "declaration by", "marksheet", "degree certificate",
      "voter list", "semester", "grade sheet", "pan card"
    ],
    requiredFields: ["income_amount"],
    patterns: {
      income_amount: {
        regex: /^\d+$/,
        description: "Annual family income in rupees"
      }
    },
    officialMarkers: ["government", "govt", "revenue department", "tahsildar", "district", "taluk", "certificate", "authorized", "digital signature"],
    fieldExtractors: {
      name: (text) => {
        const nameMatch = text.match(/(?:name\s*(?:of\s*(?:the\s*)?applicant)?|thiru|shri|smt|mr|mrs|ms)\s*[:\-]?\s*([A-Z][A-Z\s.]+)/i);
        return nameMatch ? nameMatch[1].trim() : null;
      },
      income_amount: (text) => {
        const incomeMatch = text.match(/(?:annual\s*(?:family\s*)?income|income)\s*(?:is|of|rs\.?|₹)?\s*[:\-]?\s*(?:rs\.?|₹)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?|\d{4,})/i);
        if (incomeMatch) return parseInt(incomeMatch[1].replace(/[,\.]/g, ''), 10);
        const fallback = text.match(/(?:rs\.?|₹)\s*(\d{1,3}(?:,\d{2,3})*)/i);
        return fallback ? parseInt(fallback[1].replace(/,/g, ''), 10) : null;
      },
      certificate_number: (text) => {
        const certMatch = text.match(/(?:certificate\s*(?:no|number|ref)|ref(?:erence)?\s*no|application\s*no)\s*[:\-.]?\s*([A-Z0-9\-\/]+)/i);
        return certMatch ? certMatch[1] : null;
      },
      issue_date: (text) => {
        const dateMatch = text.match(/(?:date\s*(?:of\s*issue)?|issued?\s*on|date)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
        return dateMatch ? dateMatch[1] : null;
      }
    },
    profileFields: { family_income: "income_amount" }
  },

  marksheet_10: {
    label: "10th Marksheet",
    category: "academic",
    mandatoryKeywords: ["secondary", "sslc", "class x", "class 10", "10th", "matriculation", "high school", "marksheet", "statement of marks", "board of secondary"],
    structuralIndicators: ["board of secondary education", "roll number", "register number", "marks obtained", "subject", "result", "grade", "controller of examinations", "marks statement", "pass"],
    disqualifiers: [
      "higher secondary", "12th standard", "class xii", "class 12", "hsc", "+2", "plus two", "intermediate examination",
      "degree of bachelor", "bachelor of", "diploma in", "bonafide student", "undertaking", "declaration by"
    ],
    requiredFields: ["result"],
    patterns: {},
    officialMarkers: ["board", "education", "examination", "government", "secondary", "controller of examinations", "state board", "cbse", "icse"],
    fieldExtractors: {
      name: (text) => {
        const nameMatch = text.match(/(?:name\s*(?:of\s*(?:the\s*)?(?:student|candidate))?)\s*[:\-]?\s*([A-Z][A-Za-z\s.]+)/i);
        if (nameMatch) {
          let clean = nameMatch[1].trim();
          clean = clean.replace(/\s+(?:SESSION|EXAMINATION|EXAM|REG(?:ISTRATION)?(?:\s*NO)?|ROLL(?:\s*NO)?|DOB|DATE|CLASS|STREAM|DISTRICT).*$/i, '').trim();
          return clean.length > 2 ? clean : null;
        }
        return null;
      },
      roll_number: (text) => {
        const rollMatch = text.match(/(?:roll\s*(?:no|number)|register\s*(?:no|number)|reg\.?\s*no)\s*[:\-.]?\s*([A-Z0-9\-\/]+)/i);
        return rollMatch ? rollMatch[1] : null;
      },
      board: (text) => {
        const boardMatch = text.match(/(?:board\s*of\s*[\w\s]+|cbse|icse|state\s*board|tamil\s*nadu\s*board|central\s*board)/i);
        return boardMatch ? boardMatch[0].trim() : null;
      },
      result: (text) => {
        const textLower = text.toLowerCase();
        if (textLower.includes("pass") || textLower.includes("passed") || textLower.includes("promoted") || textLower.includes("qualified") || textLower.includes("eligible") || textLower.includes("cleared") || textLower.includes("first class") || textLower.includes("distinction")) return "Passed";
        if (textLower.includes("fail") || textLower.includes("failed") || textLower.includes("compartment") || textLower.includes("essential repeat")) return "Failed";
        if (textLower.match(/(?:cgpa|gpa|grade|marks|total)\s*[:\-]?\s*[\d.]+/)) return "Passed";
        return "Passed"; // Default to passed if academic marksheet was identified
      },
      total_marks: (text) => {
        const totalMatch = text.match(/(?:total|aggregate|grand\s*total)\s*[:\-]?\s*(\d{2,4})/i);
        return totalMatch ? totalMatch[1] : null;
      }
    },
    profileFields: {}
  },

  marksheet_12: {
    label: "12th Marksheet",
    category: "academic",
    mandatoryKeywords: ["higher secondary", "hsc", "class xii", "class 12", "+2", "plus two", "intermediate", "12th standard", "senior secondary", "12th", "marksheet", "statement of marks"],
    structuralIndicators: ["board of higher secondary", "roll number", "register number", "marks statement", "statement of marks", "subject", "result", "grade", "controller of examinations", "pass", "state board"],
    disqualifiers: [
      "secondary school leaving certificate", "sslc", "class x\b", "class 10",
      "degree of bachelor", "bachelor of", "diploma in", "bonafide student", "undertaking", "declaration by"
    ],
    requiredFields: ["result"],
    patterns: {},
    officialMarkers: ["board", "education", "examination", "government", "higher secondary", "controller of examinations", "state board", "cbse", "icse"],
    fieldExtractors: {
      name: (text) => {
        const nameMatch = text.match(/(?:name\s*(?:of\s*(?:the\s*)?(?:student|candidate))?)\s*[:\-]?\s*([A-Z][A-Za-z\s.]+)/i);
        if (nameMatch) {
          let clean = nameMatch[1].trim();
          clean = clean.replace(/\s+(?:SESSION|EXAMINATION|EXAM|REG(?:ISTRATION)?(?:\s*NO)?|ROLL(?:\s*NO)?|DOB|DATE|CLASS|STREAM|DISTRICT).*$/i, '').trim();
          return clean.length > 2 ? clean : null;
        }
        return null;
      },
      roll_number: (text) => {
        const rollMatch = text.match(/(?:roll\s*(?:no|number)|register\s*(?:no|number)|reg\.?\s*no)\s*[:\-.]?\s*([A-Z0-9\-\/]+)/i);
        return rollMatch ? rollMatch[1] : null;
      },
      board: (text) => {
        const boardMatch = text.match(/(?:board\s*of\s*[\w\s]+|cbse|icse|state\s*board|tamil\s*nadu\s*board|higher\s*secondary\s*board)/i);
        return boardMatch ? boardMatch[0].trim() : null;
      },
      result: (text) => {
        const textLower = text.toLowerCase();
        if (textLower.includes("pass") || textLower.includes("passed") || textLower.includes("promoted") || textLower.includes("qualified") || textLower.includes("eligible") || textLower.includes("cleared") || textLower.includes("first class") || textLower.includes("distinction")) return "Passed";
        if (textLower.includes("fail") || textLower.includes("failed") || textLower.includes("compartment") || textLower.includes("essential repeat")) return "Failed";
        if (textLower.match(/(?:cgpa|gpa|grade|marks|total)\s*[:\-]?\s*[\d.]+/)) return "Passed";
        return "Passed"; // Default to passed if academic marksheet was identified
      },
      total_marks: (text) => {
        const totalMatch = text.match(/(?:total|aggregate|grand\s*total)\s*[:\-]?\s*(\d{2,4})/i);
        return totalMatch ? totalMatch[1] : null;
      }
    },
    profileFields: {}
  },

  diploma: {
    label: "Diploma Certificate",
    category: "academic",
    mandatoryKeywords: ["diploma in", "diploma course", "polytechnic", "state board of technical education", "directorate of technical education", "award of diploma"],
    structuralIndicators: ["director of technical education", "completed the course", "polytechnic college", "board of examinations", "institution"],
    disqualifiers: [
      "bonafide", "undertaking", "declaration", "semester result", "mark statement", "marks statement", "grade card", "fee receipt"
    ],
    requiredFields: ["course"],
    patterns: {},
    officialMarkers: ["board", "technical education", "directorate", "polytechnic", "government", "university", "controller of examinations"],
    fieldExtractors: {
      name: (text) => {
        const nameMatch = text.match(/(?:name\s*(?:of\s*(?:the\s*)?(?:student|candidate))?)\s*[:\-]?\s*([A-Z][A-Z\s.]+)/i);
        return nameMatch ? nameMatch[1].trim() : null;
      },
      course: (text) => {
        const courseMatch = text.match(/(?:diploma\s*in\s*[\w\s&]+|course\s*[:\-]?\s*[\w\s&]+)/i);
        return courseMatch ? courseMatch[0].trim() : null;
      },
      institution: (text) => {
        const instMatch = text.match(/(?:institution|college|polytechnic)\s*[:\-]?\s*([\w\s.]+?)(?:\n|$)/i);
        return instMatch ? instMatch[1].trim() : null;
      },
      result: (text) => {
        const textLower = text.toLowerCase();
        if (textLower.includes("pass") || textLower.includes("passed") || textLower.includes("completed") || textLower.includes("first class")) return "Passed";
        if (textLower.includes("fail") || textLower.includes("failed")) return "Failed";
        return null;
      },
      year: (text) => {
        const yearMatch = text.match(/(?:year\s*(?:of\s*(?:completion|passing))?|completed\s*in|passed\s*in)\s*[:\-]?\s*(\d{4})/i);
        return yearMatch ? yearMatch[1] : null;
      }
    },
    profileFields: {}
  },

  degree: {
    label: "Degree Certificate",
    category: "academic",
    mandatoryKeywords: [
      "degree of", "admitted to the degree", "conferred the degree", "awarded the degree",
      "qualified for the degree", "degree certificate", "conferred on", "admitted to the said degree",
      "bachelor of", "master of", "doctor of philosophy"
    ],
    structuralIndicators: [
      "university", "chancellor", "vice-chancellor", "registrar", "given under the seal",
      "faculty of", "senate", "admitted to the degree"
    ],
    disqualifiers: [
      "semester", "semesters", "mark statement", "marks statement", "statement of marks",
      "grade card", "grade sheet", "result sheet", "provisional mark", "tabulation sheet",
      "internal marks", "external marks", "subject code", "subject name", "credits", "sgpa",
      "bonafide", "undertaking", "declaration", "to be printed on", "institution letterhead",
      "signature of principal", "principal signature", "support letter", "character certificate",
      "transfer certificate", "conduct certificate", "fee receipt", "hall ticket"
    ],
    requiredFields: ["degree_name"],
    patterns: {},
    officialMarkers: ["university", "affiliated", "senate", "registrar", "chancellor", "vice-chancellor", "seal", "conferred"],
    fieldExtractors: {
      name: (text) => {
        const nameMatch = text.match(/(?:name\s*(?:of\s*(?:the\s*)?(?:student|candidate|graduate))?|that\s+)([A-Z][A-Z\s.]+?)(?:\s+has\s+been|\s+having|\s+is\s+admitted|\n|$)/i);
        return nameMatch ? nameMatch[1].trim() : null;
      },
      degree_name: (text) => {
        const degMatch = text.match(/(?:degree\s*of\s*[\w\s&]+?|bachelor\s*(?:of\s*[\w\s&]+?|\s*degree)|master\s*(?:of\s*[\w\s&]+?|\s*degree)|b\.?\s?(?:e|tech|sc|a|com|arch)(?:\s*in\s+[\w\s&]+)?|m\.?\s?(?:e|tech|sc|a|com)(?:\s*in\s+[\w\s&]+)?|doctor\s*of\s*philosophy)(?=\s*(?:with|in\s+the|held\s+in|having|\n|\.|\,|$|under|at|and))/i);
        if (degMatch) return degMatch[0].trim();
        const fallback = text.match(/(?:bachelor|master|b\.e|b\.tech|b\.sc|b\.a|b\.com)[\w\s&]*/i);
        return fallback ? fallback[0].slice(0, 60).trim() : null;
      },
      university: (text) => {
        const uniMatch = text.match(/(?:university\s*(?:of\s*)?[\w\s]+|[\w\s]+university)/i);
        return uniMatch ? uniMatch[0].trim() : null;
      },
      result: (text) => {
        const textLower = text.toLowerCase();
        if (textLower.includes("first class with distinction") || textLower.includes("distinction")) return "First Class with Distinction";
        if (textLower.includes("first class")) return "First Class";
        if (textLower.includes("second class")) return "Second Class";
        if (textLower.includes("pass") || textLower.includes("passed") || textLower.includes("conferred") || textLower.includes("admitted to the degree")) return "Passed / Conferred";
        if (textLower.includes("fail")) return "Failed";
        return null;
      },
      year: (text) => {
        const yearMatch = text.match(/(?:year\s*(?:of\s*(?:graduation|passing|completion))?|graduated\s*in|passed\s*in|conferred\s*in|held\s*in\s*[\w\s]*)\s*[:\-]?\s*(\d{4})/i);
        return yearMatch ? yearMatch[1] : null;
      },
      register_number: (text) => {
        const regMatch = text.match(/(?:register\s*(?:no|number)|reg\.?\s*no|roll\s*(?:no|number))\s*[:\-.]?\s*([A-Z0-9\-\/]+)/i);
        return regMatch ? regMatch[1] : null;
      }
    },
    profileFields: {}
  }
};

/**
 * Non-Target Categories Recognition
 * Specifically identifies documents that are NOT the official target certificates,
 * enabling clear, intelligent citizen feedback (e.g. "This appears to be a Semester Marksheet...").
 */
const NON_TARGET_CATEGORIES = {
  semester_marksheet: {
    label: "Semester Marksheet",
    indicators: [
      "semester", "semesters", "sgpa", "cgpa", "statement of marks", "mark statement",
      "grade sheet", "grade card", "result sheet", "internal marks", "external marks",
      "subject code", "subject title", "credits earned", "provisional result"
    ]
  },
  declaration_undertaking: {
    label: "Declaration or Undertaking",
    indicators: [
      "undertaking", "declaration", "bonafide", "bonafide student", "bonafide certificate",
      "institution letterhead", "to be printed on", "signature of principal", "principal signature",
      "i hereby declare", "i solemnly declare", "signature of applicant", "support letter"
    ]
  },
  admission_fee_receipt: {
    label: "Fee Receipt or Admission Letter",
    indicators: [
      "fee receipt", "tuition fee", "admission letter", "hall ticket", "admit card",
      "payment receipt", "transaction id", "provisional admission"
    ]
  },
  transfer_conduct_cert: {
    label: "Transfer or Conduct Certificate",
    indicators: [
      "transfer certificate", "conduct certificate", "leaving certificate", "tc no", "character certificate"
    ]
  },
  generic_invoice: {
    label: "Invoice or Bill",
    indicators: [
      "invoice", "bill to", "ship to", "purchase order", "subtotal", "tax invoice", "gstin", "amount due"
    ]
  }
};

/**
 * Get human-readable label for a document type key
 */
function getDocumentLabel(typeKey) {
  if (DOCUMENT_RULES[typeKey]) return DOCUMENT_RULES[typeKey].label;
  if (NON_TARGET_CATEGORIES[typeKey]) return NON_TARGET_CATEGORIES[typeKey].label;
  return typeKey;
}

/**
 * Get all valid document type keys
 */
function getValidDocumentTypes() {
  return Object.keys(DOCUMENT_RULES);
}

module.exports = {
  DOCUMENT_RULES,
  NON_TARGET_CATEGORIES,
  getDocumentLabel,
  getValidDocumentTypes
};
