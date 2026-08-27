/**
 * Comprehensive QA Test Suite for GovAssist AI Chatbot Grounding & Intent Fixes
 */

const fetch = global.fetch || require('node-fetch');

async function sendChatRequest(message, sessionId, activeScheme = null) {
  const res = await fetch('http://localhost:5000/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId,
      activeScheme,
    }),
  });

  const rawText = await res.text();
  const lines = rawText.split('\n');
  let accumulatedText = '';
  let doneEvent = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.replace('data: ', '').trim();
      if (!dataStr) continue;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'token') accumulatedText += parsed.text;
        if (parsed.type === 'done') doneEvent = parsed;
      } catch (e) {}
    }
  }

  return { text: accumulatedText, done: doneEvent };
}

async function runQATests() {
  console.log('=================================================================');
  console.log('GovAssist AI — Grounding & Confidence QA Verification Suite');
  console.log('=================================================================\n');

  let passed = 0;
  let total = 0;

  // ── TEST 1: Off-Topic Redirection ──
  total++;
  console.log('[TEST 1] Off-Topic Query: "what is the weather today"');
  const res1 = await sendChatRequest('what is the weather today', 'session_qa_1');
  const pass1 = res1.text.includes('specialized exclusively') && res1.done?.sources?.length === 0 && !res1.text.includes('Central Sector');
  console.log(`  Output: "${res1.text.substring(0, 100)}..."`);
  console.log(`  Sources Count: ${res1.done?.sources?.length}`);
  console.log(`  Status: ${pass1 ? '✅ PASS' : '❌ FAIL'}\n`);
  if (pass1) passed++;

  // ── TEST 2: AICTE Samriddhi Scheme ──
  total++;
  console.log('[TEST 2] Scheme Match: "AICTE Samriddhi Scheme"');
  const res2 = await sendChatRequest('AICTE Samriddhi Scheme', 'session_qa_2');
  const pass2 = res2.text.includes('Samriddhi') && !res2.text.includes('Central Sector Scheme of Scholarships');
  console.log(`  Output: "${res2.text.substring(0, 120)}..."`);
  console.log(`  Sources: ${JSON.stringify(res2.done?.sources)}`);
  console.log(`  Status: ${pass2 ? '✅ PASS' : '❌ FAIL'}\n`);
  if (pass2) passed++;

  // ── TEST 3: NIDHI-PRAYAS ──
  total++;
  console.log('[TEST 3] Scheme Match: "NIDHI-PRAYAS"');
  const res3 = await sendChatRequest('NIDHI-PRAYAS', 'session_qa_3');
  const pass3 = res3.text.includes('NIDHI-PRAYAS') && !res3.text.includes('Central Sector Scheme of Scholarships');
  console.log(`  Output: "${res3.text.substring(0, 120)}..."`);
  console.log(`  Sources: ${JSON.stringify(res3.done?.sources)}`);
  console.log(`  Status: ${pass3 ? '✅ PASS' : '❌ FAIL'}\n`);
  if (pass3) passed++;

  // ── TEST 4: PMFME Deadline ──
  total++;
  console.log('[TEST 4] Specific Deadline: "when is the deadline for pmfme"');
  const res4 = await sendChatRequest('when is the deadline for pmfme', 'session_qa_4');
  const pass4 = res4.text.includes('PMFME') && res4.text.includes('Last verified on') && !res4.text.includes('Central Sector');
  console.log(`  Output: "${res4.text.substring(0, 140)}..."`);
  console.log(`  Sources: ${JSON.stringify(res4.done?.sources)}`);
  console.log(`  Status: ${pass4 ? '✅ PASS' : '❌ FAIL'}\n`);
  if (pass4) passed++;

  // ── TEST 5: Non-Existent Scheme (No Hallucination or Stale Substitution) ──
  total++;
  console.log('[TEST 5] Non-Existent Scheme: "National Space Robotics Grant 2026"');
  const res5 = await sendChatRequest('National Space Robotics Grant 2026', 'session_qa_5');
  const pass5 = res5.text.includes("couldn't find verified records") && res5.done?.sources?.length === 0;
  console.log(`  Output: "${res5.text.substring(0, 130)}..."`);
  console.log(`  Sources Count: ${res5.done?.sources?.length}`);
  console.log(`  Status: ${pass5 ? '✅ PASS' : '❌ FAIL'}\n`);
  if (pass5) passed++;

  // ── TEST 6: Multi-Turn Context + "What happens after I submit" ──
  total++;
  console.log('[TEST 6A] Turn 1: "Tell me about UYEGP"');
  const res6a = await sendChatRequest('Tell me about UYEGP', 'session_qa_6');
  const activeScheme = res6a.done?.activeScheme;
  console.log(`  Active Scheme Locked: ${JSON.stringify(activeScheme)}`);

  console.log('[TEST 6B] Turn 2: "What happens after I submit?" (Continuity on UYEGP)');
  const res6b = await sendChatRequest('What happens after I submit?', 'session_qa_6', activeScheme);
  const pass6 = res6b.text.includes('After Submitting') && res6b.text.includes('UYEGP') && res6b.text.includes('Scrutiny');
  console.log(`  Output: "${res6b.text.substring(0, 160)}..."`);
  console.log(`  Status: ${pass6 ? '✅ PASS' : '❌ FAIL'}\n`);
  if (pass6) passed++;

  // ── TEST 7: Multi-Turn Context + "Help me fill the form" ──
  total++;
  console.log('[TEST 7] Turn 3: "Help me fill the form" (Continuity on UYEGP)');
  const res7 = await sendChatRequest('Help me fill the form', 'session_qa_6', activeScheme);
  const pass7 = res7.text.includes('Form-Filling') && res7.text.includes('Gross Annual Family Income') && res7.text.includes('General Form Guidance');
  console.log(`  Output: "${res7.text.substring(0, 160)}..."`);
  console.log(`  Status: ${pass7 ? '✅ PASS' : '❌ FAIL'}\n`);
  if (pass7) passed++;

  console.log('=================================================================');
  console.log(`SUMMARY: ${passed} / ${total} Tests Passed (${((passed/total)*100).toFixed(0)}%)`);
  console.log('=================================================================');
}

runQATests().catch(err => console.error('QA Runner Error:', err));
