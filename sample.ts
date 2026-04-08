/**
 * pii-guard — Runnable Sample Script
 *
 * Demonstrates every public function with real input/output.
 * No database required — uses in-memory storage.
 *
 * Run:  npx tsx sample.ts
 */

import { createPIIGuard } from './src/index.js';

async function main() {
  // ---------------------------------------------------------------
  // 1. Initialize — in-memory storage, no DB needed
  // ---------------------------------------------------------------
  const guard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
  });

  const scopeId = 'demo_user_123';

  // ---------------------------------------------------------------
  // 2. REDACT — Replace PII with realistic synthetic values
  // ---------------------------------------------------------------
  const input1 = 'Dr. Jane Doe (jane@hospital.org, 555-987-6543) referred patient John Smith, SSN 123-45-6789';

  console.log('=== REDACT ===');
  console.log('Input: ', input1);

  const redacted = await guard.redact(input1, { scopeId });

  console.log('Output:', redacted.text);
  console.log('');
  console.log('Entities found:');
  for (const e of redacted.entities) {
    console.log(`  [${e.type}] "${e.value}" → "${e.synthetic}" (confidence: ${e.confidence})`);
  }

  // ---------------------------------------------------------------
  // 3. RESTORE — Get back the original text
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== RESTORE ===');

  const restored = await guard.restore(redacted.text, { scopeId });

  console.log('Input: ', redacted.text);
  console.log('Output:', restored.text);
  console.log('Match: ', restored.text === input1 ? 'PERFECT MATCH' : 'MISMATCH');

  // ---------------------------------------------------------------
  // 4. DETERMINISM — Same input + same scope = same output
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== DETERMINISM ===');

  const run1 = await guard.redact('SSN: 111-22-3333', { scopeId });
  const run2 = await guard.redact('SSN: 111-22-3333', { scopeId });

  console.log('Run 1:', run1.text);
  console.log('Run 2:', run2.text);
  console.log('Same? ', run1.text === run2.text ? 'YES — deterministic' : 'NO');

  // ---------------------------------------------------------------
  // 5. SCOPE ISOLATION — Different scope = different synthetics
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== SCOPE ISOLATION ===');

  const alice = await guard.redact('SSN: 111-22-3333', { scopeId: 'alice' });
  const bob   = await guard.redact('SSN: 111-22-3333', { scopeId: 'bob' });

  console.log('Alice:', alice.text);
  console.log('Bob:  ', bob.text);
  console.log('Different?', alice.text !== bob.text ? 'YES — isolated' : 'NO');

  // ---------------------------------------------------------------
  // 6. DETECT ONLY — Find PII without replacing
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== DETECT ONLY ===');

  const input2 = 'Email admin@corp.com, call 555-111-2222, SSN 999-88-7777';
  const detected = await guard.detect(input2);

  console.log('Input:', input2);
  console.log('Found:');
  for (const e of detected) {
    console.log(`  [${e.type}] "${e.value}" at position ${e.startIndex}-${e.endIndex}`);
  }

  // ---------------------------------------------------------------
  // 7. MULTI-TYPE PARAGRAPH — Round-trip
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== COMPLEX PARAGRAPH ===');

  const paragraph =
    'Send invoice to billing@acme.com. ' +
    'Phone: 555-867-5309. ' +
    'SSN: 321-54-9876. ' +
    'Card: 4111-1111-1111-1111.';

  const r = await guard.redact(paragraph, { scopeId });
  const s = await guard.restore(r.text, { scopeId });

  console.log('Original:', paragraph);
  console.log('Redacted:', r.text);
  console.log('Restored:', s.text);
  console.log('Match:   ', s.text === paragraph ? 'PERFECT MATCH' : 'MISMATCH');

  // ---------------------------------------------------------------
  // 8. MEDICAL DOMAIN — MRN, DOB, SSN
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== MEDICAL DOMAIN ===');

  const medGuard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
    documentTypes: ['medical'],
  });

  const medInput = 'Patient MRN: 00123456. DOB: 07/22/1985. SSN: 234-56-7890';
  const medResult = await medGuard.redact(medInput, { scopeId: 'med_demo' });
  const medRestored = await medGuard.restore(medResult.text, { scopeId: 'med_demo' });

  console.log('Original:', medInput);
  console.log('Redacted:', medResult.text);
  console.log('Restored:', medRestored.text);
  console.log('Match:   ', medRestored.text === medInput ? 'PERFECT MATCH' : 'MISMATCH');

  // ---------------------------------------------------------------
  // 9. FINANCIAL DOMAIN — Credit card, IBAN
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== FINANCIAL DOMAIN ===');

  const finGuard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
    documentTypes: ['financial'],
  });

  const finInput = 'Card 4000-1234-5678-9012, IBAN: DE89370400440532013000';
  const finResult = await finGuard.redact(finInput, { scopeId: 'fin_demo' });
  const finRestored = await finGuard.restore(finResult.text, { scopeId: 'fin_demo' });

  console.log('Original:', finInput);
  console.log('Redacted:', finResult.text);
  console.log('Restored:', finRestored.text);
  console.log('Match:   ', finRestored.text === finInput ? 'PERFECT MATCH' : 'MISMATCH');

  // ---------------------------------------------------------------
  // 10. EMBEDDING CONSISTENCY — Document + Query match
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== EMBEDDING CONSISTENCY ===');

  const embScope = 'project_42';
  const doc   = await guard.redactForEmbedding('Patient file for SSN 999-88-7777', { scopeId: embScope });
  const query = await guard.redactForEmbedding('Find records for SSN 999-88-7777', { scopeId: embScope });

  const docSSN   = doc.text.match(/(\d{3}-\d{2}-\d{4})/)?.[1];
  const querySSN = query.text.match(/(\d{3}-\d{2}-\d{4})/)?.[1];

  console.log('Document:', doc.text);
  console.log('Query:   ', query.text);
  console.log('SSN match:', docSSN === querySSN ? `YES — both "${docSSN}"` : 'NO');

  // ---------------------------------------------------------------
  // 11. TYPE OVERRIDES — Mask strategy
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== TYPE OVERRIDES: MASK STRATEGY ===');

  const maskGuard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
    typeOverrides: {
      SSN: { strategy: 'mask' },
      EMAIL: { strategy: 'mask', maskLabel: '[EMAIL REMOVED]' },
    },
  });

  const maskInput = 'Contact jane@hospital.org, SSN 123-45-6789, Phone 555-987-6543';
  const maskResult = await maskGuard.redact(maskInput, { scopeId: 'mask_demo' });

  console.log('Input: ', maskInput);
  console.log('Output:', maskResult.text);
  console.log('');
  console.log('Entities:');
  for (const e of maskResult.entities) {
    console.log(`  [${e.type}] "${e.value}" → "${e.synthetic}"`);
  }

  // ---------------------------------------------------------------
  // 12. TYPE OVERRIDES — Hash strategy
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== TYPE OVERRIDES: HASH STRATEGY ===');

  const hashGuard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
    typeOverrides: {
      EMAIL: { strategy: 'hash' },
      SSN: { strategy: 'hash' },
    },
  });

  const hashInput = 'Email john@acme.com, SSN 123-45-6789';
  const hashResult1 = await hashGuard.redact(hashInput, { scopeId: 'scope_A' });
  const hashResult2 = await hashGuard.redact(hashInput, { scopeId: 'scope_A' });
  const hashResult3 = await hashGuard.redact(hashInput, { scopeId: 'scope_B' });

  console.log('Input:  ', hashInput);
  console.log('Scope A:', hashResult1.text);
  console.log('Scope A:', hashResult2.text, '(same — deterministic)');
  console.log('Scope B:', hashResult3.text, '(different — scope-isolated)');

  // ---------------------------------------------------------------
  // 13. TYPE OVERRIDES — Skip strategy
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== TYPE OVERRIDES: SKIP STRATEGY ===');

  const skipGuard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
    typeOverrides: {
      PHONE: { strategy: 'skip' },
    },
  });

  const skipInput = 'Email admin@corp.com, Phone 555-867-5309, SSN 321-54-9876';
  const skipResult = await skipGuard.redact(skipInput, { scopeId: 'skip_demo' });

  console.log('Input: ', skipInput);
  console.log('Output:', skipResult.text);
  console.log('(Phone detected but left unchanged; email and SSN replaced with synthetics)');

  // ---------------------------------------------------------------
  // 14. TYPE OVERRIDES — Custom function strategy
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== TYPE OVERRIDES: CUSTOM FUNCTION ===');

  const fnGuard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
    typeOverrides: {
      CREDIT_CARD: {
        strategy: (value: string) => {
          const last4 = value.replace(/\D/g, '').slice(-4);
          return `****-****-****-${last4}`;
        },
      },
      SSN: {
        strategy: (value: string) => {
          const last4 = value.slice(-4);
          return `***-**-${last4}`;
        },
      },
    },
  });

  const fnInput = 'Card: 4111-1111-1111-1111, SSN: 123-45-6789';
  const fnResult = await fnGuard.redact(fnInput, { scopeId: 'fn_demo' });

  console.log('Input: ', fnInput);
  console.log('Output:', fnResult.text);

  // ---------------------------------------------------------------
  // 15. TYPE OVERRIDES — Disable specific types
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== TYPE OVERRIDES: DISABLE TYPES ===');

  const disableGuard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
    typeOverrides: {
      SSN: { enabled: false },
      PHONE: { enabled: false },
    },
  });

  const disableInput = 'Email john@acme.com, SSN 123-45-6789, Phone 555-123-4567';
  const disableResult = await disableGuard.redact(disableInput, { scopeId: 'disable_demo' });

  console.log('Input: ', disableInput);
  console.log('Output:', disableResult.text);
  console.log('Types: ', disableResult.entities.map(e => e.type).join(', ') || '(none)');
  console.log('(SSN and Phone left unchanged — only Email redacted)');

  // ---------------------------------------------------------------
  // 16. TYPE OVERRIDES — Mixed strategies in one guard
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== TYPE OVERRIDES: MIXED STRATEGIES ===');

  const mixedGuard = await createPIIGuard({
    salt: 'demo-salt-for-testing',
    typeOverrides: {
      EMAIL: { strategy: 'synthetic' },               // default — realistic fake
      SSN:   { strategy: 'mask' },                     // fixed label
      CREDIT_CARD: { strategy: 'hash' },               // deterministic hash
      PHONE: { strategy: 'skip' },                     // detected but unchanged
    },
  });

  const mixedInput =
    'Email: billing@acme.com | SSN: 321-54-9876 | Card: 4111-1111-1111-1111 | Phone: 555-867-5309';
  const mixedResult = await mixedGuard.redact(mixedInput, { scopeId: 'mixed_demo' });

  console.log('Input: ', mixedInput);
  console.log('Output:', mixedResult.text);
  console.log('');
  console.log('Per-entity breakdown:');
  for (const e of mixedResult.entities) {
    console.log(`  [${e.type.padEnd(12)}] "${e.value}" → "${e.synthetic}"`);
  }

  // ---------------------------------------------------------------
  // 17. HEALTH CHECK
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== HEALTH CHECK ===');

  const health = await guard.healthCheck();
  console.log('Database:', health.database ? 'OK' : 'FAIL');
  console.log('Cache:   ', health.cache ? 'OK' : 'FAIL');

  // ---------------------------------------------------------------
  // 18. ROBUST RESTORE — LLM reformatting resilience
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== ROBUST RESTORE — LLM REFORMATTING RESILIENCE ===');
  console.log('');
  console.log('Scenario: Text with PII is redacted, sent to an LLM, and the LLM');
  console.log('reformats the synthetic values (spaces instead of dashes, uppercase, etc.)');
  console.log('Exact-match restore handles verbatim synthetics; reformatted ones are unresolved.');
  console.log('');

  try {
    const robustGuard = await createPIIGuard({
      salt: 'demo-salt-for-testing',
    });
    const robustScope = 'llm-roundtrip-demo';

    // Step 1: Original user message with PII
    const userMessage =
      'Customer SSN 321-54-9876 called from 555-867-5309 about card 4532-9876-5432-1098. ' +
      'Email: billing@acme.com. Please summarize the ticket.';
    console.log('1. ORIGINAL USER MESSAGE:');
    console.log(`   ${userMessage}`);
    console.log('');

    // Step 2: Redact before sending to LLM
    const redacted = await robustGuard.redact(userMessage, { scopeId: robustScope });
    console.log('2. REDACTED (sent to LLM):');
    console.log(`   ${redacted.text}`);
    console.log('');
    console.log('   Mappings:');
    for (const e of redacted.entities) {
      console.log(`   [${e.type.padEnd(12)}] "${e.value}" → "${e.synthetic}"`);
    }
    console.log('');

    // Step 3: Simulate LLM response with reformatted values
    const ssnSyn = redacted.entities.find(e => e.type === 'SSN')?.synthetic;
    const phoneSyn = redacted.entities.find(e => e.type === 'PHONE')?.synthetic;
    const ccSyn = redacted.entities.find(e => e.type === 'CREDIT_CARD')?.synthetic;
    const emailSyn = redacted.entities.find(e => e.type === 'EMAIL')?.synthetic;

    // LLM reformats: SSN spaces, phone parens, CC spaces, email verbatim
    const ssnReformatted = ssnSyn?.replace(/-/g, ' ') ?? '';
    const phoneDigits = phoneSyn?.replace(/\D/g, '') ?? '';
    const phoneReformatted = phoneDigits
      ? `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`
      : '';
    const ccReformatted = ccSyn?.replace(/-/g, ' ') ?? '';

    const llmResponse =
      `Here's a summary of the support ticket:\n` +
      `- SSN: ${ssnReformatted}\n` +
      `- Phone: ${phoneReformatted}\n` +
      `- Card: ${ccReformatted}\n` +
      `- Email: ${emailSyn}\n` +
      `The customer needs assistance with their account.`;

    console.log('3. LLM RESPONSE (reformatted synthetics):');
    for (const line of llmResponse.split('\n')) {
      console.log(`   ${line}`);
    }
    console.log('');

    // Step 4: Restore — exact match handles verbatim synthetics
    const restored = await robustGuard.restore(llmResponse, { scopeId: robustScope });
    console.log('4. RESTORED (originals recovered):');
    for (const line of restored.text.split('\n')) {
      console.log(`   ${line}`);
    }
    console.log('');
    console.log(`   Resolved: ${restored.resolved}`);
    console.log(`   Unresolved: ${restored.unresolved.length}`);
    console.log('');

    // Verify
    const hasSSN = restored.text.includes('321-54-9876');
    const hasPhone = restored.text.includes('555-867-5309');
    const hasCC = restored.text.includes('4532-9876-5432-1098');
    const hasEmail = restored.text.includes('billing@acme.com');
    console.log('   Verification:');
    console.log(`   SSN restored:   ${hasSSN ? 'YES' : 'NO'}`);
    console.log(`   Phone restored: ${hasPhone ? 'YES' : 'NO'}`);
    console.log(`   Card restored:  ${hasCC ? 'YES' : 'NO'}`);
    console.log(`   Email restored: ${hasEmail ? 'YES' : 'NO'}`);

    await robustGuard.shutdown();
  } catch (err: any) {
    console.log('Robust restore demo skipped:', err.message);
  }

  // ---------------------------------------------------------------
  // 19. SHUTDOWN
  // ---------------------------------------------------------------
  await guard.shutdown();
  await maskGuard.shutdown();
  await hashGuard.shutdown();
  await skipGuard.shutdown();
  await fnGuard.shutdown();
  await disableGuard.shutdown();
  await mixedGuard.shutdown();
  console.log('');
  console.log('Done. All connections closed.');
}

main().catch(console.error);
