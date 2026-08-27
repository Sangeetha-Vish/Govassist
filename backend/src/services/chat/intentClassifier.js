/**
 * GovAssist AI — Intent & Query Classifier
 * Classifies user questions into structured execution paths.
 */

function detectOffTopic(query) {
  if (!query || typeof query !== 'string') return { isOffTopic: true, response: "Please ask a question related to government schemes or citizen welfare services." };
  const q = query.trim().toLowerCase();

  // Basic greetings & bot identity
  const greetings = ['hello', 'hi', 'hey', 'good morning', 'good evening', 'who are you', 'what is your name', 'how are you'];
  if (greetings.includes(q)) {
    return {
      isOffTopic: true,
      response: "Hello! I am GovAssist AI, your official Scheme Assistant for Indian and Tamil Nadu government welfare schemes. How can I help you find schemes, check eligibility, verify deadlines, troubleshoot documents, or navigate applications today?"
    };
  }

  // Weather queries
  if (/\b(weather|temperature|forecast|rain|climate|humidity)\b/i.test(q)) {
    return {
      isOffTopic: true,
      response: "I am specialized exclusively in helping citizens discover and apply for government welfare schemes. For live weather updates, please check official meteorological services. Would you like to check agricultural, student, or startup schemes instead?"
    };
  }

  // General coding, math, trivia, non-government queries
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

function classifyQuery(query) {
  const q = query.trim().toLowerCase();

  // 1. Off-Topic Check
  const offTopic = detectOffTopic(query);
  if (offTopic.isOffTopic) {
    return { intent: 'OFF_TOPIC', payload: offTopic.response };
  }

  // 2. Document Rejection & Troubleshooting (Capability 2)
  if (/\b(why wasn't|why was(n't)? my (doc|document|marksheet|certificate|pan|aadhaar|income)|rejection reason|why (did|is) my document (rejected|need attention|fail|pending)|document (was )?rejected|why rejected)\b/i.test(q)) {
    return { intent: 'DOCUMENT_TROUBLESHOOTING' };
  }

  // 3. Personalized Recommendations (Capability 3)
  if (/\b(what schemes am i eligible for|recommend (some |any )?schemes?( for me)?|what (can|do) i qualify for|which schemes fit me|schemes for my profile|my recommendations|what schemes are available for me|give me recommendations)\b/i.test(q)) {
    return { intent: 'PERSONALIZED_RECOMMENDATIONS' };
  }

  // 4. Processing / Turnaround Time (Capability 5)
  if (/\b(how long (from applying|until i hear|does it take|to get|is the processing)|processing time|turnaround (time|estimate)|disbursement timeline|when will i receive)\b/i.test(q)) {
    return { intent: 'PROCESSING_TIME' };
  }

  // 5. Deadlines
  if (/\b(deadline|last date|when is the (due|closing|last)|due date|closing date|application window|last day to apply)\b/i.test(q)) {
    return { intent: 'DEADLINE' };
  }

  // 6. Application Tracking
  if (/\b(track( my)? application|check( my)? status|application status|where is my application|track status)\b/i.test(q)) {
    return { intent: 'APPLICATION_TRACKING' };
  }

  // 7. Form-Filling Guidance
  if (/\b(help me fill|fill(ing)? (the |this )?form|gross or net|what do i put|form guidance|how to fill (the |this )?application)\b/i.test(q)) {
    return { intent: 'FORM_FILLING_HELP' };
  }

  // 8. Mechanism / How It Works
  if (/\b(how does (this|it) work|mechanism of|who runs|how it works|implementing agency|how is benefit disbursed)\b/i.test(q)) {
    return { intent: 'HOW_IT_WORKS' };
  }

  // 9. How to Apply
  if (/\b(how (do|can) i apply|application (steps|procedure|process)|where to apply|how to register)\b/i.test(q)) {
    return { intent: 'HOW_TO_APPLY' };
  }

  // 10. Eligibility & Criteria
  if (/\b(am i eligible|eligibility (criteria|rules|details)|do i qualify|who is eligible|eligibility for|age limit for|income limit for)\b/i.test(q)) {
    return { intent: 'ELIGIBILITY_CHECK' };
  }

  // 11. Natural Language Situation Discovery (Capability 4)
  if (/\b(i am a|i'm a|looking for|help me find (a |some )?scheme|find a scheme|scheme for (a )?(girl|boy|student|farmer|women|woman|widow|differently abled|disabled|startup|entrepreneur|business))\b/i.test(q)) {
    return { intent: 'NATURAL_LANGUAGE_DISCOVERY' };
  }

  return { intent: 'GENERAL_QUERY' };
}

module.exports = {
  detectOffTopic,
  classifyQuery
};
