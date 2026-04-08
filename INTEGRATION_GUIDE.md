# pii-guard — Integration Guide

How to add PII redaction to any Node.js project. This guide covers installation, configuration, every public function, and runnable examples for Express, Fastify, plain Node, and standalone scripts.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Environment Variables](#2-environment-variables)
3. [Quick Start (5 lines)](#3-quick-start)
4. [Configuration Options](#4-configuration-options)
5. [API Reference — All Functions](#5-api-reference)
6. [Storage Backends](#6-storage-backends)
7. [Express Integration](#7-express-integration)
8. [Fastify Integration](#8-fastify-integration)
9. [Plain Node.js / Script Usage](#9-plain-nodejs--script-usage)
10. [File Processing](#10-file-processing)
11. [RAG / Vector Embedding Pipeline](#11-rag--vector-embedding-pipeline)
12. [LLM Proxy (Redact Before, Restore After)](#12-llm-proxy-redact-before-restore-after)
13. [Custom PII Patterns](#13-custom-pii-patterns)
14. [Per-Type Override Configuration](#14-per-type-override-configuration)
15. [Custom Storage & Cache Adapters](#15-custom-storage--cache-adapters)
16. [Local LLM Detection Provider](#16-local-llm-detection-provider)
17. [Full Working Sample Script](#17-full-working-sample-script)
18. [PII Types Detected](#18-pii-types-detected)

---

## 1. Installation

```bash
npm install pii-guard
```

Then install the driver for your chosen database:

```bash
# PostgreSQL
npm install knex pg

# MySQL
npm install knex mysql2

# MongoDB
npm install mongoose

# Redis cache (optional — falls back to in-memory)
npm install ioredis
```

No migrations needed. Tables/collections are auto-created on first use.

---

## 2. Environment Variables

Add to your `.env` file (all optional — can be passed in code instead):

```bash
# Database backend selection (default: 'postgresql')
PII_GUARD_DB_TYPE=postgresql          # 'postgresql' | 'mysql' | 'mongodb'

# SQL connection (when PII_GUARD_DB_TYPE is 'postgresql' or 'mysql')
PII_DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# MongoDB connection (when PII_GUARD_DB_TYPE is 'mongodb')
PII_MONGODB_URI=mongodb://localhost:27017/mydb

# HMAC salt for hashing PII (auto-generated if not set — set this for persistence across restarts)
PII_GUARD_SALT=your-secret-salt-here

# Redis cache (optional)
PII_REDIS_URL=redis://localhost:6379/0

# Detection provider (default: 'builtin')
PII_GUARD_DETECTION_PROVIDER=builtin   # 'builtin' | 'aws-comprehend' | 'local-llm' | 'hybrid'

# AWS Comprehend (only needed when using aws-comprehend or hybrid provider)
PII_AWS_REGION=us-east-1               # Required when using aws-comprehend/hybrid
PII_AWS_ACCESS_KEY_ID=AKIA...          # Optional — falls back to AWS SDK credential chain
PII_AWS_SECRET_ACCESS_KEY=wJalr...     # Optional — falls back to AWS SDK credential chain
PII_AWS_LANGUAGE_CODE=en               # Optional (default: 'en')
PII_AWS_MIN_CONFIDENCE=0.8             # Optional (default: 0.8, range: 0-1)

# Local LLM (only needed when using local-llm or hybrid provider with local-llm)
PII_LOCAL_MODEL=onnx-community/piiranha-v1-detect-personal-information-ONNX  # Optional — overrides bundled model
PII_LOCAL_MODEL_CACHE_DIR=/path/to/cache   # Optional — model cache directory
PII_LOCAL_MIN_CONFIDENCE=0.5               # Optional (default: 0.5, range: 0-1)
PII_LOCAL_DEVICE=cpu                       # Optional — 'cpu' or 'gpu' (default: auto)
```

If no `PII_DATABASE_URL` / `PII_MONGODB_URI` is set and no custom storage adapter is provided, pii-guard falls back to **in-memory storage** (no persistence across restarts).

---

## 3. Quick Start

```typescript
import { createPIIGuard } from 'pii-guard';

const guard = await createPIIGuard();

// Redact
const result = await guard.redact(
  'Email john@acme.com, SSN 123-45-6789',
  { scopeId: 'user_123' }
);
console.log(result.text);
// → "Email sage.t@vanguard-systems.net, SSN 954-94-4426"

// Restore
const restored = await guard.restore(result.text, { scopeId: 'user_123' });
console.log(restored.text);
// → "Email john@acme.com, SSN 123-45-6789"
```

That's it. `createPIIGuard()` reads `PII_DATABASE_URL` and `PII_REDIS_URL` from `.env` automatically.

---

## 4. Configuration Options

You can pass everything explicitly instead of using env vars:

```typescript
const guard = await createPIIGuard({
  // Database
  dbType: 'postgresql',                        // 'postgresql' | 'mysql' | 'mongodb'
  databaseUrl: 'postgresql://...',             // SQL connection string
  mongoUri: 'mongodb://...',                   // MongoDB connection string

  // Cache
  redisUrl: 'redis://localhost:6379',          // optional

  // Security
  salt: 'my-hmac-salt',                        // IMPORTANT: set this for consistent mappings across restarts

  // Tuning
  cacheTtlSeconds: 3600,                       // cache lifetime (default: 3600)
  contextWindowSize: 50,                       // chars before/after PII for context extraction (default: 50)

  // Document types — controls which patterns are active
  documentTypes: ['general', 'medical'],       // default: ['general']

  // Custom adapters (overrides dbType/databaseUrl)
  storage: myCustomStorageAdapter,             // implements StorageAdapter
  cache: myCustomCacheAdapter,                 // implements CacheAdapter

  // Detection provider
  detectionProvider: 'builtin',                // 'builtin' | 'aws-comprehend' | 'local-llm' | 'hybrid' | custom instance

  // AWS Comprehend (only if detectionProvider uses it)
  awsComprehend: {
    region: 'us-east-1',
    minConfidence: 0.8,
  },

  // Custom PII patterns (added to defaults)
  patterns: [
    { type: 'CUSTOM', pattern: /PROJ-\d{6}/g, confidence: 0.9 }
  ],

  // Custom synthetic value pools (merged with defaults)
  pools: {
    maleFirstNames: ['Kenji', 'Hiroshi', 'Ravi'],
    corporateDomains: ['custom-corp.co.jp'],
  },

  // Per-type overrides (see section 14 for details)
  typeOverrides: {
    SSN: { strategy: 'mask' },
    EMAIL: { strategy: 'hash' },
    PHONE: { enabled: false },
  },
});
```

---

## 5. API Reference

### `createPIIGuard(config?): Promise<PIIGuard>`

Factory function. Reads `.env`, resolves config, returns a ready-to-use `PIIGuard` instance.

```typescript
import { createPIIGuard } from 'pii-guard';
const guard = await createPIIGuard({ salt: 'my-salt' });
```

---

### `guard.redact(text, { scopeId }): Promise<RedactResult>`

Replaces all detected PII with realistic synthetic values.

```typescript
const result = await guard.redact(
  'Dr. Jane Doe (jane@hospital.org, 555-987-6543) referred patient John Smith, SSN 123-45-6789',
  { scopeId: 'user_123' }
);
```

**Returns:**

```typescript
{
  text: string;                    // text with PII replaced
  entities: PIIEntity[];           // every detected entity with its synthetic value
  mapping: Map<string, string>;    // original → synthetic
}
```

**`scopeId`** determines synthetic consistency:
- Same `scopeId` + same PII value = **same synthetic every time** (deterministic)
- Different `scopeId` = different synthetic (isolated)
- Use `userId` for per-user, `projectId` for per-project, or any string

---

### `guard.restore(text, { scopeId }): Promise<RestoreResult>`

Replaces synthetic values back to originals. Requires the same `scopeId` used during `redact()`.

```typescript
const restored = await guard.restore(redactedText, { scopeId: 'user_123' });
```

**Returns:**

```typescript
{
  text: string;          // original text recovered
  resolved: number;      // count of synthetics successfully resolved
  unresolved: string[];  // synthetics that couldn't be resolved (if any)
}
```

---

### `guard.redactForEmbedding(text, { scopeId }): Promise<RedactResult>`

Same as `redact()`. Use this before indexing documents into a vector database. Because synthetics are deterministic within a scope, redacting both documents and queries with the same `scopeId` ensures vector search matches work correctly.

```typescript
// Indexing
const doc = await guard.redactForEmbedding(documentText, { scopeId: 'project_42' });
await vectorDb.upsert(doc.text);

// Querying (same scopeId → same synthetics → vector match works)
const query = await guard.redactForEmbedding(userQuery, { scopeId: 'project_42' });
const results = await vectorDb.search(query.text);
```

---

### `guard.detect(text): Promise<PIIEntity[]>`

Scans text for PII **without replacing** anything. Useful for auditing or building dashboards.

```typescript
const entities = await guard.detect('Email john@acme.com and SSN 123-45-6789');
// [
//   { type: 'EMAIL', value: 'john@acme.com', startIndex: 6, endIndex: 19, confidence: 0.95, synthetic: '' },
//   { type: 'SSN',   value: '123-45-6789',   startIndex: 28, endIndex: 39, confidence: 0.95, synthetic: '' },
// ]
```

---

### `guard.healthCheck(): Promise<{ database: boolean; cache: boolean }>`

Verifies database and cache connectivity.

```typescript
const health = await guard.healthCheck();
// { database: true, cache: true }
```

---

### `guard.shutdown(): Promise<void>`

Clean shutdown. Call on process exit to close database/cache connections.

```typescript
process.on('SIGTERM', async () => {
  await guard.shutdown();
  process.exit(0);
});
```

---

## 6. Storage Backends

### PostgreSQL

```bash
npm install knex pg
```

```bash
# .env
PII_GUARD_DB_TYPE=postgresql
PII_DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb
```

```typescript
// or explicitly:
const guard = await createPIIGuard({
  dbType: 'postgresql',
  databaseUrl: 'postgresql://postgres:password@localhost:5432/mydb',
});
```

### MySQL

```bash
npm install knex mysql2
```

```bash
# .env
PII_GUARD_DB_TYPE=mysql
PII_DATABASE_URL=mysql://root:password@localhost:3306/mydb
```

```typescript
const guard = await createPIIGuard({
  dbType: 'mysql',
  databaseUrl: 'mysql://root:password@localhost:3306/mydb',
});
```

### MongoDB

```bash
npm install mongoose
```

```bash
# .env
PII_GUARD_DB_TYPE=mongodb
PII_MONGODB_URI=mongodb://localhost:27017/mydb
```

```typescript
const guard = await createPIIGuard({
  dbType: 'mongodb',
  mongoUri: 'mongodb://localhost:27017/mydb',
});
```

### In-Memory (no installation needed)

If no database URL is configured, pii-guard automatically uses in-memory storage. Good for testing and stateless use cases.

```typescript
const guard = await createPIIGuard({ salt: 'test-salt' });
// Uses InMemoryAdapter — no persistence across restarts
```

### Direct Adapter Usage

You can also instantiate adapters directly:

```typescript
import { createPIIGuard, KnexAdapter, MongooseAdapter } from 'pii-guard';

// Pass a custom adapter instance
const guard = await createPIIGuard({
  storage: new KnexAdapter('postgresql://localhost:5432/mydb'),
});
```

---

## 7. Express Integration

### Option A: Built-in Middleware

pii-guard ships with Express middleware that automatically redacts `messages` and `sharedMemory` arrays in `req.body`:

```typescript
import express from 'express';
import { createPIIGuard, createExpressMiddleware } from 'pii-guard';

const app = express();
app.use(express.json());

const guard = await createPIIGuard({ salt: 'production-salt' });

const piiMiddleware = createExpressMiddleware(guard, {
  // How to extract the scopeId from each request:
  scopeResolver: (req) => req.body?.userId || req.headers['x-user-id'],

  // Which body fields contain message arrays to redact (default: ['messages', 'sharedMemory']):
  messageFields: ['messages'],
});

// Apply to LLM routes — PII is redacted before your handler runs
app.post('/api/chat', piiMiddleware, async (req, res) => {
  // req.body.messages[*].content is now redacted
  const llmResponse = await callLLM(req.body.messages);
  res.json({ response: llmResponse });
});

app.listen(3000);
```

### Option B: Manual Redact/Restore in Route Handler

```typescript
import express from 'express';
import { createPIIGuard } from 'pii-guard';

const app = express();
app.use(express.json());

const guard = await createPIIGuard();

app.post('/api/chat', async (req, res) => {
  const { userId, message } = req.body;

  // 1. Redact user message before sending to LLM
  const redacted = await guard.redact(message, { scopeId: userId });

  // 2. Send redacted text to LLM
  const llmResponse = await callLLM(redacted.text);

  // 3. Restore PII in LLM response before sending back to user
  const restored = await guard.restore(llmResponse, { scopeId: userId });

  res.json({ response: restored.text });
});

app.listen(3000);
```

---

## 8. Fastify Integration

```typescript
import Fastify from 'fastify';
import { createPIIGuard } from 'pii-guard';

const fastify = Fastify();
const guard = await createPIIGuard();

// Redact hook — runs before all /api/* handlers
fastify.addHook('preHandler', async (request, reply) => {
  if (!request.url.startsWith('/api/')) return;

  const scopeId = (request.body as any)?.userId || request.headers['x-user-id'];
  if (!scopeId) return;

  const body = request.body as any;
  if (Array.isArray(body?.messages)) {
    body.messages = await Promise.all(
      body.messages.map(async (msg: any) => {
        if (typeof msg.content !== 'string') return msg;
        const result = await guard.redact(msg.content, { scopeId });
        return { ...msg, content: result.text };
      })
    );
  }
});

fastify.post('/api/chat', async (request, reply) => {
  // request.body.messages[*].content is already redacted
  return { ok: true };
});

fastify.listen({ port: 3000 });
```

---

## 9. Plain Node.js / Script Usage

No framework needed. Works in any Node.js script:

```typescript
import { createPIIGuard } from 'pii-guard';

async function main() {
  const guard = await createPIIGuard({
    dbType: 'postgresql',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5432/mydb',
    salt: 'my-secret-salt',
  });

  // --- REDACT ---
  const input = 'Patient John Smith (john@hospital.org), SSN 123-45-6789, DOB: 03/15/1990';
  const result = await guard.redact(input, { scopeId: 'patient_records' });

  console.log('Original:', input);
  console.log('Redacted:', result.text);
  console.log('Entities:');
  for (const e of result.entities) {
    console.log(`  ${e.type}: "${e.value}" → "${e.synthetic}"`);
  }

  // --- RESTORE ---
  const restored = await guard.restore(result.text, { scopeId: 'patient_records' });
  console.log('Restored:', restored.text);
  console.log('Match:', restored.text === input); // true

  await guard.shutdown();
}

main();
```

---

## 10. File Processing

pii-guard can process files directly — no need to manually extract text first.

### Supported Formats

| Format | Extension(s) | Dependency | Writable |
|--------|-------------|------------|----------|
| Plain text | `.txt`, `.md`, `.log` | None | Yes |
| CSV | `.csv` | None | Yes |
| JSON | `.json` | None | Yes |
| HTML | `.html`, `.htm` | None | Yes |
| XML | `.xml` | None | Yes |
| PDF | `.pdf` | `pdf-parse` | No |
| DOCX | `.docx` | `mammoth` | No |

Install optional dependencies for PDF/DOCX:

```bash
# PDF support
npm install pdf-parse

# DOCX support
npm install mammoth
```

### `guard.redactFile(input, opts): Promise<FileRedactResult>`

Redact PII in a file. Accepts a file path (string) or a Buffer.

```typescript
import { createPIIGuard } from 'pii-guard';

const guard = await createPIIGuard({ salt: 'my-salt' });

// --- From a .txt file ---
const result = await guard.redactFile('data/patient-notes.txt', {
  scopeId: 'project_1',
});
console.log(result.text);       // redacted text
console.log(result.entities);   // detected PII entities
console.log(result.format);     // 'txt'

// --- From a PDF (requires pdf-parse) ---
const pdfResult = await guard.redactFile('reports/invoice.pdf', {
  scopeId: 'project_1',
});

// --- From a DOCX (requires mammoth) ---
const docxResult = await guard.redactFile('docs/letter.docx', {
  scopeId: 'project_1',
});

// --- Write redacted output to a new file (text formats only) ---
await guard.redactFile('data/notes.txt', {
  scopeId: 'project_1',
  outputPath: 'data/notes-redacted.txt',
});
```

### `guard.detectFile(input, opts?): Promise<FileDetectResult>`

Detect PII in a file without replacing anything.

```typescript
const detected = await guard.detectFile('data/report.csv');

console.log(`Found ${detected.entities.length} PII entities`);
console.log(`Format: ${detected.format}`);
console.log(`Extracted text: ${detected.extractedText.slice(0, 100)}...`);

for (const e of detected.entities) {
  console.log(`  [${e.type}] "${e.value}" at ${e.startIndex}-${e.endIndex}`);
}
```

### `extractText(input, opts?): Promise<TextExtractionResult>`

Standalone utility — extract plain text from any supported file without PII processing.

```typescript
import { extractText } from 'pii-guard';

const result = await extractText('document.html');
console.log(result.text);      // stripped HTML → plain text
console.log(result.format);    // 'html'
console.log(result.charCount); // character count
```

### Buffer Input

Pass a `Buffer` directly when you already have file contents in memory. You must specify `format` since there's no file extension to infer from:

```typescript
import { readFile } from 'node:fs/promises';
import { createPIIGuard } from 'pii-guard';

const guard = await createPIIGuard({ salt: 'my-salt' });
const buf = await readFile('uploaded-file.txt');

const result = await guard.redactFile(buf, {
  scopeId: 'upload_1',
  format: 'txt',
});
```

---

## 11. RAG / Vector Embedding Pipeline

When indexing documents for RAG (Retrieval Augmented Generation), redact PII before embedding. Because synthetics are deterministic within a scope, vector similarity search still works.

```typescript
import { createPIIGuard } from 'pii-guard';

const guard = await createPIIGuard({ salt: 'rag-salt' });

// --- INDEXING ---
async function indexDocument(docId: string, text: string, projectId: string) {
  const redacted = await guard.redactForEmbedding(text, { scopeId: projectId });

  // Index the redacted text — no PII in your vector DB
  await vectorDb.upsert({
    id: docId,
    text: redacted.text,
    embedding: await embed(redacted.text),
  });
}

// --- QUERYING ---
async function queryDocuments(query: string, projectId: string) {
  // Redact the query with the same scopeId → synthetics match the indexed docs
  const redacted = await guard.redactForEmbedding(query, { scopeId: projectId });

  const results = await vectorDb.search({
    embedding: await embed(redacted.text),
    topK: 5,
  });

  // Restore PII in the results before showing to user
  const restored = await Promise.all(
    results.map(async (r) => {
      const res = await guard.restore(r.text, { scopeId: projectId });
      return { ...r, text: res.text };
    })
  );

  return restored;
}
```

---

## 12. LLM Proxy (Redact Before, Restore After)

Full pattern: redact user input, send to LLM, then restore PII in the response:

```typescript
import { createPIIGuard } from 'pii-guard';

const guard = await createPIIGuard();

async function safeLLMCall(userMessage: string, userId: string): Promise<string> {
  // 1. Redact PII from user message
  const redacted = await guard.redact(userMessage, { scopeId: userId });

  console.log('LLM sees:', redacted.text);
  // "Dr. Sarah Chen (sarah.c@meridian-health.net) referred patient David Park, SSN 987-65-4320"
  // The LLM reads natural text — no [PERSON_1] tokens, no confusion

  // 2. Call LLM with redacted text
  const llmResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: redacted.text }],
    }),
  }).then(r => r.json());

  const llmText = llmResponse.choices[0].message.content;

  // 3. Restore PII in the LLM response before returning to user
  const restored = await guard.restore(llmText, { scopeId: userId });

  return restored.text;
}

// Usage
const response = await safeLLMCall(
  'Dr. Jane Doe (jane@hospital.org) referred patient John Smith, SSN 123-45-6789',
  'user_42'
);
```

---

## 13. Custom PII Patterns

Add your own regex patterns on top of the built-in ones:

```typescript
const guard = await createPIIGuard({
  patterns: [
    // Match internal project codes
    {
      type: 'CUSTOM',
      pattern: /PROJ-\d{6}/g,
      confidence: 0.9,
      documentTypes: ['general'],
    },
    // Match employee IDs
    {
      type: 'CUSTOM',
      pattern: /EMP-[A-Z]{2}\d{4}/g,
      confidence: 0.85,
      documentTypes: ['general'],
    },
  ],
});
```

---

## 14. Per-Type Override Configuration

Control detection and redaction behavior per PII type using `typeOverrides`. You can disable specific types, change the redaction strategy, override confidence thresholds, and replace or extend patterns.

### TypeOverrideConfig Reference

```typescript
interface TypeOverrideConfig {
  enabled?: boolean;              // false = skip detection entirely for this type
  confidence?: number;            // override confidence threshold
  strategy?: RedactStrategy | RedactStrategyFn;  // replacement strategy (default: 'synthetic')
  maskLabel?: string;             // custom label for 'mask' strategy (default: '[{TYPE}_REDACTED]')
  patterns?: PIIPatternConfig[];  // REPLACE all default patterns for this type
  addPatterns?: PIIPatternConfig[];  // ADD extra patterns without removing defaults
}

type RedactStrategy = 'synthetic' | 'mask' | 'hash' | 'skip';
type RedactStrategyFn = (value: string, entity: PIIEntity) => string;
```

### Strategy Reference

| Strategy | Output Example | Restorable? | Description |
|----------|---------------|-------------|-------------|
| `'synthetic'` | `sage.t@vanguard.net` | Yes | Default. Realistic fake value, stored for round-trip restore |
| `'mask'` | `[EMAIL_REDACTED]` | No | Fixed label. Customize with `maskLabel` |
| `'hash'` | `[HASH-A1B2C3D4]` | No | Deterministic within scope. Different scope = different hash |
| `'skip'` | *(original value)* | N/A | Entity detected but text left unchanged |
| `function` | `****-****-****-1234` | No | Custom replacement logic via callback |

### Enable/Disable Types

```typescript
const guard = await createPIIGuard({
  typeOverrides: {
    SSN: { enabled: false },
    PHONE: { enabled: false },
  },
});
```

**Input:**  `Email john@acme.com, SSN 123-45-6789, Phone 555-123-4567`
**Output:** `Email parker.a@atlas-corp.com, SSN 123-45-6789, Phone 555-123-4567`

SSN and Phone are left untouched — only Email is detected and redacted.

### Mask Strategy

```typescript
const guard = await createPIIGuard({
  typeOverrides: {
    SSN: { strategy: 'mask' },
    EMAIL: { strategy: 'mask', maskLabel: '[EMAIL REMOVED]' },
  },
});
```

**Input:**  `Contact jane@hospital.org, SSN 123-45-6789, Phone 555-987-6543`
**Output:** `Contact [EMAIL REMOVED], SSN [SSN_REDACTED], Phone 555-128-5076`

SSN gets the default mask `[SSN_REDACTED]`, Email gets the custom label, Phone uses default synthetic strategy.

### Hash Strategy

```typescript
const guard = await createPIIGuard({
  typeOverrides: {
    EMAIL: { strategy: 'hash' },
    SSN: { strategy: 'hash' },
  },
});
```

**Input:**   `Email john@acme.com, SSN 123-45-6789`
**Scope A:** `Email [HASH-C0A61AEC], SSN [HASH-8DDCD498]`
**Scope A:** `Email [HASH-C0A61AEC], SSN [HASH-8DDCD498]` *(same — deterministic)*
**Scope B:** `Email [HASH-794B5184], SSN [HASH-7AF312B6]` *(different — scope-isolated)*

### Skip Strategy

```typescript
const guard = await createPIIGuard({
  typeOverrides: {
    PHONE: { strategy: 'skip' },
  },
});
```

**Input:**  `Email admin@corp.com, Phone 555-867-5309, SSN 321-54-9876`
**Output:** `Email charlie.o@spire-technologies.com, Phone 555-867-5309, SSN 994-62-1695`

Phone is detected (appears in `entities`) but left unchanged in the output text.

### Custom Function Strategy

```typescript
const guard = await createPIIGuard({
  typeOverrides: {
    CREDIT_CARD: {
      strategy: (value, entity) => {
        const last4 = value.replace(/\D/g, '').slice(-4);
        return `****-****-****-${last4}`;
      },
    },
    SSN: {
      strategy: (value) => `***-**-${value.slice(-4)}`,
    },
  },
});
```

**Input:**  `Card: 4111-1111-1111-1111, SSN: 123-45-6789`
**Output:** `Card: ****-****-****-1111, SSN: ***-**-6789`

### Mixed Strategies (One Guard, Multiple Types)

```typescript
const guard = await createPIIGuard({
  typeOverrides: {
    EMAIL: { strategy: 'synthetic' },       // default — realistic fake
    SSN:   { strategy: 'mask' },            // fixed label
    CREDIT_CARD: { strategy: 'hash' },      // deterministic hash
    PHONE: { strategy: 'skip' },            // detected but unchanged
  },
});
```

**Input:**
`Email: billing@acme.com | SSN: 321-54-9876 | Card: 4111-1111-1111-1111 | Phone: 555-867-5309`

**Output:**
`Email: haven.m@westmark-industries.com | SSN: [SSN_REDACTED] | Card: [HASH-1CCD1FC2] | Phone: 555-867-5309`

| Entity | Strategy | Original | Replacement |
|--------|----------|----------|-------------|
| EMAIL | synthetic | `billing@acme.com` | `haven.m@westmark-industries.com` |
| SSN | mask | `321-54-9876` | `[SSN_REDACTED]` |
| CREDIT_CARD | hash | `4111-1111-1111-1111` | `[HASH-1CCD1FC2]` |
| PHONE | skip | `555-867-5309` | `555-867-5309` |

### Confidence Overrides

```typescript
const guard = await createPIIGuard({
  typeOverrides: {
    SSN: { confidence: 0.5 },
  },
});
```

Overrides the confidence value reported on detected SSN entities (in both `redact()` and `detect()` results).

### Pattern Overrides

```typescript
const guard = await createPIIGuard({
  typeOverrides: {
    // REPLACE all default SSN patterns with a custom one
    SSN: {
      patterns: [
        { type: 'SSN', pattern: /SSN#\d{9}/g, confidence: 0.9 },
      ],
    },

    // ADD extra email patterns (keeps all defaults)
    EMAIL: {
      addPatterns: [
        { type: 'EMAIL', pattern: /[\w.+-]+\[at\][\w.-]+\.\w+/g, confidence: 0.9 },
      ],
    },
  },
});
```

- `patterns` — **replaces** all built-in patterns for that type. The original `123-45-6789` format will no longer be detected.
- `addPatterns` — **appends** new patterns. Both `john@acme.com` and `john[at]acme.com` are detected.

---

## 15. Custom Storage & Cache Adapters

Implement the `StorageAdapter` or `CacheAdapter` interface to use any backend:

```typescript
import { createPIIGuard } from 'pii-guard';
import type { StorageAdapter, CacheAdapter } from 'pii-guard';

// Custom storage (e.g., DynamoDB, Firestore, etc.)
class DynamoDBAdapter implements StorageAdapter {
  async findByHash(scopeId: string, entityHash: string) { /* ... */ }
  async create(scopeId: string, entityType: string, entityHash: string, synthetic: string, encryptedOriginal: string, contextJson?: string) { /* ... */ }
  async findBySynthetic(scopeId: string, synthetic: string) { /* ... */ }
  async findAllForScope(scopeId: string) { /* ... */ }
  async disconnect() { /* ... */ }
}

// Custom cache (e.g., Memcached, LRU on disk, etc.)
class MemcachedAdapter implements CacheAdapter {
  async get(key: string) { /* ... */ }
  async set(key: string, value: string, ttlSeconds: number) { /* ... */ }
  async disconnect() { /* ... */ }
}

const guard = await createPIIGuard({
  storage: new DynamoDBAdapter(),
  cache: new MemcachedAdapter(),
});
```

---

## 16. Local LLM Detection Provider

pii-guard ships with a bundled ONNX model ([Piiranha v1](https://huggingface.co/onnx-community/piiranha-v1-detect-personal-information-ONNX)) that runs on CPU for context-aware PII detection. Unlike regex, it understands context — e.g., "my social is 123456789" is detected as an SSN even without dashes or labels.

**Key properties:**
- Fully offline — model is bundled in the package (~300MB quantized)
- 99.44% accuracy, 98.27% PII recall
- 17 entity types: SSN, phone, email, names, addresses, credit cards, DOB, etc.
- Multi-language: English, Spanish, French, German, Italian, Dutch
- ~50-200ms per short text on CPU after model loaded

### When to Use

- **Context-aware PII**: Detect PII that regex misses (bare numbers, informal text)
- **Offline / air-gapped environments**: No cloud API needed
- **Hybrid mode**: Combine with regex for best coverage

### Standalone Usage

```typescript
const guard = await createPIIGuard({
  detectionProvider: 'local-llm',
});

const result = await guard.detect('My social is 123456789 and call me at 5551234567');
// Detects SSN and phone from context — regex would miss these
```

### Hybrid Mode (Recommended)

Combine regex (fast, structured patterns) with LLM (contextual understanding):

```typescript
const guard = await createPIIGuard({
  detectionProvider: 'hybrid',
  hybridDetection: {
    providers: ['builtin', 'local-llm'],
    strategy: 'union',  // combine results from both providers
  },
});
```

### Supported Entity Types

| Piiranha Label | PIIType | Example |
|---------------|---------|---------|
| `SOCIAL_SECURITY_NUMBER` | `SSN` | 123-45-6789, 123456789 |
| `TELEPHONE` | `PHONE` | 555-123-4567, 5551234567 |
| `EMAIL` | `EMAIL` | john@acme.com |
| `CREDIT_CARD_NUMBER` | `CREDIT_CARD` | 4111-1111-1111-1111 |
| `FIRST_NAME` | `NAME` | John |
| `LAST_NAME` | `NAME` | Smith |
| `STREET_ADDRESS` | `ADDRESS` | 123 Oak Lane |
| `CITY` | `ADDRESS` | New York |
| `BUILDING_NUMBER` | `ADDRESS` | Suite 100 |
| `ZIPCODE` | `ADDRESS` | 10001 |
| `DATE_OF_BIRTH` | `DATE_OF_BIRTH` | 03/15/1990 |
| `ACCOUNT_NUMBER` | `ACCOUNT_NUMBER` | 123456789012 |
| `DRIVER_LICENSE` | `CUSTOM` | DL-123456 |
| `ID_NUMBER` | `CUSTOM` | ID-987654 |
| `TAX_ID` | `CUSTOM` | 12-3456789 |
| `USERNAME` | `CUSTOM` | jsmith42 |
| `PASSWORD` | `CUSTOM` | p@ssw0rd |

Adjacent `FIRST_NAME` + `LAST_NAME` tokens are automatically merged into a single `NAME` entity.

### Custom Model

Override the bundled model with a custom HuggingFace model:

```typescript
const guard = await createPIIGuard({
  detectionProvider: 'local-llm',
  localLLM: {
    modelId: 'your-org/your-custom-model',  // overrides bundled model
    minConfidence: 0.6,
    device: 'cpu',
  },
});
```

### Custom Entity Mapping

Add or override the label-to-PIIType mapping:

```typescript
const guard = await createPIIGuard({
  detectionProvider: 'local-llm',
  localLLM: {
    entityTypeMap: {
      CUSTOM_LABEL: PIIType.CUSTOM,
    },
  },
});
```

---

## 17. Full Working Sample Script

Copy this file, install deps, and run it. No database required (uses in-memory storage).

**`sample.ts`**

```typescript
import { createPIIGuard } from 'pii-guard';

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
  // 8. TYPE OVERRIDES — Mask strategy
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
  // 9. TYPE OVERRIDES — Hash strategy (deterministic + scope-isolated)
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
  // 10. TYPE OVERRIDES — Skip strategy (detect but don't replace)
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
  // 11. TYPE OVERRIDES — Custom function strategy
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
  // 12. TYPE OVERRIDES — Disable specific types
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
  // 13. TYPE OVERRIDES — Mixed strategies in one guard
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
  // 14. HEALTH CHECK
  // ---------------------------------------------------------------
  console.log('');
  console.log('=== HEALTH CHECK ===');

  const health = await guard.healthCheck();
  console.log('Database:', health.database ? 'OK' : 'FAIL');
  console.log('Cache:   ', health.cache ? 'OK' : 'FAIL');

  // ---------------------------------------------------------------
  // 15. SHUTDOWN
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
```

**Run it:**

```bash
npx tsx sample.ts
```

**Expected output:**

```
=== REDACT ===
Input:  Dr. Jane Doe (jane@hospital.org, 555-987-6543) referred patient John Smith, SSN 123-45-6789
Output: Dr. Jane Doe (jamie.p@prism-analytics.com, 555-917-8719) referred patient John Smith, SSN 944-73-7757

Entities found:
  [EMAIL] "jane@hospital.org" → "jamie.p@prism-analytics.com" (confidence: 0.95)
  [PHONE] "555-987-6543" → "555-917-8719" (confidence: 0.85)
  [SSN] "123-45-6789" → "944-73-7757" (confidence: 0.95)

=== RESTORE ===
Input:  Dr. Jane Doe (jamie.p@prism-analytics.com, 555-917-8719) referred patient John Smith, SSN 944-73-7757
Output: Dr. Jane Doe (jane@hospital.org, 555-987-6543) referred patient John Smith, SSN 123-45-6789
Match:  PERFECT MATCH

=== DETERMINISM ===
Run 1: SSN: 986-31-6574
Run 2: SSN: 986-31-6574
Same?  YES — deterministic

=== SCOPE ISOLATION ===
Alice: SSN: 949-59-4846
Bob:   SSN: 955-89-9735
Different? YES — isolated

=== DETECT ONLY ===
Input: Email admin@corp.com, call 555-111-2222, SSN 999-88-7777
Found:
  [EMAIL] "admin@corp.com" at position 6-20
  [PHONE] "555-111-2222" at position 27-39
  [SSN] "999-88-7777" at position 45-56

=== COMPLEX PARAGRAPH ===
Original: Send invoice to billing@acme.com. Phone: 555-867-5309. SSN: 321-54-9876. Card: 4111-1111-1111-1111.
Redacted: Send invoice to phoenix.t@greenfield-bio.com. Phone: 555-229-1329. SSN: 932-12-9252. Card: 5100-0059-2786-4311.
Restored: Send invoice to billing@acme.com. Phone: 555-867-5309. SSN: 321-54-9876. Card: 4111-1111-1111-1111.
Match:    PERFECT MATCH

=== TYPE OVERRIDES: MASK STRATEGY ===
Input:  Contact jane@hospital.org, SSN 123-45-6789, Phone 555-987-6543
Output: Contact [EMAIL REMOVED], SSN [SSN_REDACTED], Phone 555-128-5076

Entities:
  [EMAIL] "jane@hospital.org" → "[EMAIL REMOVED]"
  [SSN] "123-45-6789" → "[SSN_REDACTED]"
  [PHONE] "555-987-6543" → "555-128-5076"

=== TYPE OVERRIDES: HASH STRATEGY ===
Input:   Email john@acme.com, SSN 123-45-6789
Scope A: Email [HASH-C0A61AEC], SSN [HASH-8DDCD498]
Scope A: Email [HASH-C0A61AEC], SSN [HASH-8DDCD498] (same — deterministic)
Scope B: Email [HASH-794B5184], SSN [HASH-7AF312B6] (different — scope-isolated)

=== TYPE OVERRIDES: SKIP STRATEGY ===
Input:  Email admin@corp.com, Phone 555-867-5309, SSN 321-54-9876
Output: Email charlie.o@spire-technologies.com, Phone 555-867-5309, SSN 994-62-1695
(Phone detected but left unchanged; email and SSN replaced with synthetics)

=== TYPE OVERRIDES: CUSTOM FUNCTION ===
Input:  Card: 4111-1111-1111-1111, SSN: 123-45-6789
Output: Card: ****-****-****-1111, SSN: ***-**-6789

=== TYPE OVERRIDES: DISABLE TYPES ===
Input:  Email john@acme.com, SSN 123-45-6789, Phone 555-123-4567
Output: Email parker.a@atlas-corp.com, SSN 123-45-6789, Phone 555-123-4567
Types:  EMAIL
(SSN and Phone left unchanged — only Email redacted)

=== TYPE OVERRIDES: MIXED STRATEGIES ===
Input:  Email: billing@acme.com | SSN: 321-54-9876 | Card: 4111-1111-1111-1111 | Phone: 555-867-5309
Output: Email: haven.m@westmark-industries.com | SSN: [SSN_REDACTED] | Card: [HASH-1CCD1FC2] | Phone: 555-867-5309

Per-entity breakdown:
  [EMAIL       ] "billing@acme.com" → "haven.m@westmark-industries.com"
  [SSN         ] "321-54-9876" → "[SSN_REDACTED]"
  [CREDIT_CARD ] "4111-1111-1111-1111" → "[HASH-1CCD1FC2]"
  [PHONE       ] "555-867-5309" → "555-867-5309"

=== HEALTH CHECK ===
Database: OK
Cache:    OK

Done. All connections closed.
```

---

## 18. PII Types Detected

### General (always active)

| Type | Example Input | Example Synthetic |
|------|--------------|-------------------|
| `EMAIL` | `john@acme.com` | `sage.t@vanguard-systems.net` |
| `PHONE` | `555-123-4567` | `555-749-4178` |
| `PHONE` (UK) | `+44 20 7946 0958` | `+44 41 0165 3084` |
| `SSN` | `123-45-6789` | `954-94-4426` |
| `CREDIT_CARD` | `4532-1234-5678-9012` | `6011-0089-8822-2730` |
| `DATE_OF_BIRTH` | `DOB: 03/15/1990` | `DOB: 09/21/1990` |
| `ADDRESS` | `123 Oak Street` | `2415 Beechwood Ln` |
| `ACCOUNT_NUMBER` | `Account: 12345678901234` | `Account: 555513866...` |

### Medical (active when `documentTypes` includes `'medical'`)

| Type | Example Input | Example Synthetic |
|------|--------------|-------------------|
| `MEDICAL_RECORD` | `MRN: 00847291` | `MRN: MRN-67060978` |
| `DIAGNOSIS_CODE` | `E11.65` | `[REDACTED-C2414948]` |
| `INSURANCE_ID` | `Insurance ID: BCBS-12345678` | `Insurance ID: [REDACTED-...]` |
| `MEDICATION` | `Prescribed Metformin 500 mg` | `Prescribed [REDACTED-...]` |

### Financial (active when `documentTypes` includes `'financial'`)

| Type | Example Input | Example Synthetic |
|------|--------------|-------------------|
| `BANK_DETAILS` | `IBAN: DE89370400440532013000` | `IBAN: 582889704616` |
| `CREDIT_CARD` | `4000-1234-5678-9012` | `4000-0011-1039-7122` |
| `ACCOUNT_NUMBER` | `Account: 98765432101234` | `Account: 770454028426` |

### Synthetic Value Safety Properties

- **SSN** synthetics use 900-999 area range (IRS reserved, never issued to real people)
- **Phone** synthetics use 555-xxx prefix (NANPA reserved for fiction)
- **Credit card** synthetics use non-issuable BIN ranges with valid Luhn checksum
- **Dates** preserve approximate decade (within ~5 years)
- **Emails** respect corporate vs personal domain context
- **Originals** are AES-256-GCM encrypted in the database — never stored in plaintext
