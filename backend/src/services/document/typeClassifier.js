/**
 * Smart Document Understanding & Type Classifier — Stage 3
 * Analyzes document semantic content, positive structural markers, negative evidence,
 * and identifies the actual document type to override user selection when mismatched.
 */

const { DOCUMENT_RULES, NON_TARGET_CATEGORIES, getDocumentLabel } = require("../documentRules");

function getArticle(word) {
  const first = (word || "").trim().toLowerCase()[0];
  return ['a', 'e', 'i', 'o', 'u'].includes(first) ? 'an' : 'a';
}

function classify(text, selectedType) {
  const textLower = text.toLowerCase();
  const selectedRules = DOCUMENT_RULES[selectedType];
  const selectedLabel = getDocumentLabel(selectedType);

  if (!selectedRules) {
    return {
      pass: false,
      code: "INVALID_TYPE",
      userMessage: "Please select a valid document type from the list.",
      data: { selectedType }
    };
  }

  // ─── 1. SCORE ALL TARGET DOCUMENT TYPES ───
  const targetScores = {};
  const positiveEvidence = {};
  const negativeEvidence = {};

  for (const [typeKey, rules] of Object.entries(DOCUMENT_RULES)) {
    let score = 0;
    const pos = [];
    const neg = [];

    // Check mandatory keywords (MUST have at least one mandatory keyword to qualify)
    let hasMandatory = false;
    if (rules.mandatoryKeywords && rules.mandatoryKeywords.length > 0) {
      for (const kw of rules.mandatoryKeywords) {
        if (textLower.includes(kw.toLowerCase())) {
          score += 3;
          pos.push(kw);
          hasMandatory = true;
        }
      }
    } else {
      hasMandatory = true;
    }

    if (!hasMandatory) {
      targetScores[typeKey] = 0;
      positiveEvidence[typeKey] = [];
      negativeEvidence[typeKey] = [];
      continue;
    }

    // Check structural indicators (+1 point each)
    if (rules.structuralIndicators) {
      for (const ind of rules.structuralIndicators) {
        if (textLower.includes(ind.toLowerCase())) {
          score += 1;
          pos.push(ind);
        }
      }
    }

    // Check official markers (+1 point each)
    if (rules.officialMarkers) {
      for (const m of rules.officialMarkers) {
        if (textLower.includes(m.toLowerCase())) {
          score += 1;
          pos.push(m);
        }
      }
    }

    // Check disqualifiers (-5 points penalty)
    if (rules.disqualifiers) {
      for (const disq of rules.disqualifiers) {
        if (textLower.includes(disq.toLowerCase())) {
          score -= 5;
          neg.push(disq);
        }
      }
    }

    targetScores[typeKey] = Math.max(0, score);
    positiveEvidence[typeKey] = pos;
    negativeEvidence[typeKey] = neg;
  }

  // ─── 2. SCORE NON-TARGET DOCUMENT CATEGORIES (e.g. Semester Marksheets, Undertakings, Fee Receipts) ───
  const nonTargetScores = {};
  for (const [nonTargetKey, categoryDef] of Object.entries(NON_TARGET_CATEGORIES)) {
    let count = 0;
    for (const ind of categoryDef.indicators) {
      if (textLower.includes(ind.toLowerCase())) {
        count++;
      }
    }
    nonTargetScores[nonTargetKey] = count;
  }

  // Find best matching non-target category
  let bestNonTarget = null;
  let bestNonTargetScore = 0;
  for (const [catKey, score] of Object.entries(nonTargetScores)) {
    if (score > bestNonTargetScore) {
      bestNonTarget = catKey;
      bestNonTargetScore = score;
    }
  }

  // Find best matching target type
  let bestTarget = null;
  let bestTargetScore = 0;
  for (const [typeKey, score] of Object.entries(targetScores)) {
    if (score > bestTargetScore) {
      bestTarget = typeKey;
      bestTargetScore = score;
    }
  }

  const selectedScore = targetScores[selectedType] || 0;
  const selectedNegativeCount = negativeEvidence[selectedType]?.length || 0;

  // Determine actual document winner (Target type vs Non-target category)
  let actualKey = null;
  if (bestTarget && bestTargetScore >= 3 && bestTargetScore >= bestNonTargetScore * 1.2) {
    actualKey = bestTarget;
  } else if (bestNonTarget && bestNonTargetScore >= 2) {
    actualKey = bestNonTarget;
  } else if (bestTarget && bestTargetScore > 0) {
    actualKey = bestTarget;
  }

  const actualLabel = actualKey ? getDocumentLabel(actualKey) : null;
  const article = actualLabel ? getArticle(actualLabel) : 'a';
  const selectedArticle = getArticle(selectedLabel);

  // ─── 3. OVERRIDE & REJECTION EVALUATION ───

  // Case A: Document is recognized as a different target type or non-target category
  if (actualKey && actualKey !== selectedType) {
    return {
      pass: false,
      code: "WRONG_TYPE",
      userMessage: `This appears to be ${article} ${actualLabel}, not ${selectedArticle} ${selectedLabel}. Please upload your ${selectedLabel}.`,
      data: {
        actualType: actualKey,
        actualLabel,
        selectedType,
        negativeEvidence: negativeEvidence[selectedType],
        targetScores,
        nonTargetScores
      }
    };
  }

  // Case B: Disqualifier found for the selected type
  if (selectedNegativeCount > 0) {
    const fallbackLabel = actualLabel || "different document";
    const art = getArticle(fallbackLabel);
    return {
      pass: false,
      code: "WRONG_TYPE",
      userMessage: `This appears to be ${art} ${fallbackLabel}, not ${selectedArticle} ${selectedLabel}. Please upload your ${selectedLabel}.`,
      data: {
        actualType: actualKey,
        selectedType,
        disqualifiersFound: negativeEvidence[selectedType]
      }
    };
  }

  // Case C: No recognizable document structure or mandatory keywords for selected type
  if (selectedScore < 2) {
    return {
      pass: false,
      code: "UNRECOGNIZED",
      userMessage: `This doesn't appear to be a valid ${selectedLabel}. Please upload the correct document.`,
      data: {
        selectedType,
        selectedScore,
        bestTarget,
        bestNonTarget
      }
    };
  }

  // ─── 4. CONFIRMED TARGET TYPE ───
  return {
    pass: true,
    code: "OK",
    data: {
      actualType: selectedType,
      actualLabel: selectedLabel,
      confidenceScore: selectedScore,
      positiveEvidence: positiveEvidence[selectedType],
      negativeEvidence: []
    }
  };
}

module.exports = { classify };
