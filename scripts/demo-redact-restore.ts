/**
 * Demo: shows original → redacted → restored strings for every scenario.
 * Run: npx tsx scripts/demo-redact-restore.ts
 */
import { createPIIGuard } from '../src/index.js';

const B = '\x1b[1m', R = '\x1b[0m', G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m', M = '\x1b[35m';

function hr(title: string) {
  console.log(`\n${B}${'═'.repeat(90)}${R}`);
  console.log(`${B}  ${title}${R}`);
  console.log(`${B}${'═'.repeat(90)}${R}`);
}

function row(label: string, val: string) {
  console.log(`  ${C}${label.padEnd(14)}${R}│ ${val}`);
}

async function main() {
  const guard = await createPIIGuard({ salt: 'demo-show-strings' });

  // ── Scenario 1: Customer Support Email ──
  hr('SCENARIO 1: Customer Support Email  (SSN + Email + Phone + Credit Card)');
  {
    const scopeId = 'demo_s1';
    const original =
      'Dear Support, my SSN is 123-45-6789 and you can reach me at john@acme.com ' +
      'or 555-123-4567. My card number is 4111-1111-1111-1111. Please help!';

    const redacted = await guard.redact(original, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    row('ORIGINAL', original);
    console.log('');
    row('REDACTED', redacted.text);
    console.log('');
    console.log(`  ${Y}Entities:${R}`);
    for (const e of redacted.entities) {
      console.log(`    ${M}[${e.type.padEnd(12)}]${R}  "${G}${e.value}${R}"  →  "${Y}${e.synthetic}${R}"`);
    }
    console.log('');
    row('RESTORED', restored.text);
    row('MATCH', restored.text === original ? `${G}✓ PERFECT MATCH${R}` : '\x1b[31m✗ MISMATCH\x1b[0m');
  }

  // ── Scenario 2: Medical Record ──
  hr('SCENARIO 2: Medical Record  (MRN + SSN + DOB + Email + Phone)');
  {
    const medGuard = await createPIIGuard({ salt: 'demo-show-strings', documentTypes: ['medical'] });
    const scopeId = 'demo_s2';
    const original =
      'Patient MRN: 00847291. SSN: 234-56-7890. DOB: 07/22/1985. ' +
      'Contact: patient@hospital.org, phone 555-200-3000.';

    const redacted = await medGuard.redact(original, { scopeId });
    const restored = await medGuard.restore(redacted.text, { scopeId });

    row('ORIGINAL', original);
    console.log('');
    row('REDACTED', redacted.text);
    console.log('');
    console.log(`  ${Y}Entities:${R}`);
    for (const e of redacted.entities) {
      console.log(`    ${M}[${e.type.padEnd(15)}]${R}  "${G}${e.value}${R}"  →  "${Y}${e.synthetic}${R}"`);
    }
    console.log('');
    row('RESTORED', restored.text);
    row('MATCH', restored.text === original ? `${G}✓ PERFECT MATCH${R}` : '\x1b[31m✗ MISMATCH\x1b[0m');
    await medGuard.shutdown();
  }

  // ── Scenario 3: Financial Report ──
  hr('SCENARIO 3: Financial Report  (Credit Card + SSN + Email + IBAN)');
  {
    const finGuard = await createPIIGuard({ salt: 'demo-show-strings', documentTypes: ['financial'] });
    const scopeId = 'demo_s3';
    const original =
      'Charge to card 4532-9876-5432-1098. SSN: 456-78-9012. ' +
      'Email: billing@acme.com. IBAN: DE89370400440532013000.';

    const redacted = await finGuard.redact(original, { scopeId });
    const restored = await finGuard.restore(redacted.text, { scopeId });

    row('ORIGINAL', original);
    console.log('');
    row('REDACTED', redacted.text);
    console.log('');
    console.log(`  ${Y}Entities:${R}`);
    for (const e of redacted.entities) {
      console.log(`    ${M}[${e.type.padEnd(15)}]${R}  "${G}${e.value}${R}"  →  "${Y}${e.synthetic}${R}"`);
    }
    console.log('');
    row('RESTORED', restored.text);
    row('MATCH', restored.text === original ? `${G}✓ PERFECT MATCH${R}` : '\x1b[31m✗ MISMATCH\x1b[0m');
    await finGuard.shutdown();
  }

  // ── Scenario 4: Multi-paragraph HR document ──
  hr('SCENARIO 4: Multi-Paragraph HR Document  (8 PII entities)');
  {
    const scopeId = 'demo_s4';
    const original = [
      'CONFIDENTIAL — Internal HR Document',
      '',
      'Employee: SSN 456-78-9012',
      'Contact: hr@company.com | 555-200-3000',
      'DOB: 11/30/1985',
      '',
      'Emergency contact phone: 555-600-7000',
      'Direct deposit card: 4532-9876-5432-1098',
      'Office: 742 Evergreen Ave in Springfield',
      'Account: 88776655443322',
    ].join('\n');

    const redacted = await guard.redact(original, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    console.log(`\n  ${C}ORIGINAL:${R}`);
    for (const line of original.split('\n')) console.log(`    │ ${line}`);
    console.log(`\n  ${C}REDACTED:${R}`);
    for (const line of redacted.text.split('\n')) console.log(`    │ ${Y}${line}${R}`);
    console.log('');
    console.log(`  ${Y}Entities (${redacted.entities.length}):${R}`);
    for (const e of redacted.entities) {
      console.log(`    ${M}[${e.type.padEnd(15)}]${R}  "${G}${e.value}${R}"  →  "${Y}${e.synthetic}${R}"`);
    }
    console.log(`\n  ${C}RESTORED:${R}`);
    for (const line of restored.text.split('\n')) console.log(`    │ ${line}`);
    console.log('');
    row('MATCH', restored.text === original ? `${G}✓ PERFECT MATCH${R}` : '\x1b[31m✗ MISMATCH\x1b[0m');
  }

  // ── Scenario 5: Determinism + Scope Isolation ──
  hr('SCENARIO 5: Determinism + Scope Isolation');
  {
    const input = 'SSN: 111-22-3333, Email: alice@example.com';

    const run1 = await guard.redact(input, { scopeId: 'alice' });
    const run2 = await guard.redact(input, { scopeId: 'alice' });
    const run3 = await guard.redact(input, { scopeId: 'bob' });

    row('ORIGINAL', input);
    console.log('');
    row('ALICE run 1', run1.text);
    row('ALICE run 2', run2.text);
    row('DETERMINISTIC', run1.text === run2.text ? `${G}✓ YES — identical${R}` : '\x1b[31m✗ NO\x1b[0m');
    console.log('');
    row('BOB run 1', run3.text);
    row('ISOLATED', run1.text !== run3.text ? `${G}✓ YES — different scopes${R}` : '\x1b[31m✗ NO\x1b[0m');
  }

  // ── Scenario 6: Detection only ──
  hr('SCENARIO 6: Detect Only  (no replacement)');
  {
    const input = 'Email admin@corp.com, call 555-111-2222, SSN 999-88-7777, Card 4111-1111-1111-1111';
    const entities = await guard.detect(input);

    row('INPUT', input);
    console.log('');
    console.log(`  ${Y}Detected (${entities.length}):${R}`);
    for (const e of entities) {
      console.log(`    ${M}[${e.type.padEnd(12)}]${R}  "${G}${e.value}${R}"  at ${e.startIndex}..${e.endIndex}  conf=${e.confidence}`);
    }
  }

  // ── Scenario 7: Type overrides ──
  hr('SCENARIO 7: Type Override Strategies  (mask + hash + skip + function)');
  {
    const mixedGuard = await createPIIGuard({
      salt: 'demo-show-strings',
      typeOverrides: {
        EMAIL:       { strategy: 'synthetic' },
        SSN:         { strategy: 'mask' },
        CREDIT_CARD: { strategy: 'hash' },
        PHONE:       { strategy: 'skip' },
      },
    });
    const input = 'Email: billing@acme.com | SSN: 321-54-9876 | Card: 4111-1111-1111-1111 | Phone: 555-867-5309';
    const result = await mixedGuard.redact(input, { scopeId: 'demo_mixed' });

    row('ORIGINAL', input);
    console.log('');
    row('REDACTED', result.text);
    console.log('');
    console.log(`  ${Y}Per-entity:${R}`);
    for (const e of result.entities) {
      console.log(`    ${M}[${e.type.padEnd(12)}]${R}  "${G}${e.value}${R}"  →  "${Y}${e.synthetic}${R}"`);
    }
    await mixedGuard.shutdown();
  }

  await guard.shutdown();
  console.log(`\n${G}Done. All connections closed.${R}\n`);
}

main().catch(console.error);
