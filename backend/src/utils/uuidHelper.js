const crypto = require('crypto');

/**
 * Generate a consistent UUID v5 from a user_id string
 * Uses a fixed namespace to ensure the same user_id always generates the same UUID
 */
function userIdToUUID(userId) {
  if (!userId) return null;
  
  // If userId is already a valid UUID, just return it
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return userId;
  }
  
  // Namespace UUID for GovAssist (can be any valid UUID, this is a fixed one for consistency)
  const NAMESPACE_UUID = '550e8400-e29b-41d4-a716-446655440000';
  
  // Convert string to UUID v5 using SHA-1 hash
  const namespace = Buffer.from(NAMESPACE_UUID.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1');
  hash.update(namespace);
  hash.update(userId);
  
  const digest = hash.digest();
  
  // Set version to 5 (SHA-1 based)
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  
  // Format as UUID string
  const hex = digest.toString('hex');
  return [
    hex.substr(0, 8),
    hex.substr(8, 4),
    hex.substr(12, 4),
    hex.substr(16, 4),
    hex.substr(20, 12)
  ].join('-');
}

/**
 * Convert explanation object to PostgreSQL text array format
 * Combines all explanation messages into a single text array
 */
function explanationToArray(explanation) {
  if (!explanation) return [];
  
  const messages = [];
  
  // Add qualified reasons
  if (explanation.why_qualified && Array.isArray(explanation.why_qualified)) {
    messages.push(...explanation.why_qualified);
  }
  
  // Add ineligible reasons
  if (explanation.why_ineligible && Array.isArray(explanation.why_ineligible)) {
    messages.push(...explanation.why_ineligible);
  }
  
  // Add missing info
  if (explanation.missing_info && Array.isArray(explanation.missing_info)) {
    messages.push(...explanation.missing_info);
  }
  
  return messages;
}

module.exports = {
  userIdToUUID,
  explanationToArray
};

