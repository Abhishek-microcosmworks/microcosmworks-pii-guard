import { describe, it, expect, vi } from 'vitest';
import { createExpressMiddleware } from '../src/middleware/express.js';
import type { PIIGuard } from '../src/PIIGuard.js';

function createMockGuard(): PIIGuard {
  return {
    redact: vi.fn().mockImplementation(async (text: string) => ({
      text: text.replace(/john@acme\.com/g, 'david.p@novus-tech.com'),
      entities: [],
      mapping: new Map(),
    })),
    restore: vi.fn(),
    detect: vi.fn(),
    redactForEmbedding: vi.fn(),
    healthCheck: vi.fn(),
    shutdown: vi.fn(),
  } as any;
}

describe('Express Middleware', () => {
  it('should redact PII in message fields', async () => {
    const guard = createMockGuard();
    const middleware = createExpressMiddleware(guard);

    const req = {
      body: {
        userId: 'user_1',
        messages: [
          { role: 'user', content: 'Contact john@acme.com' },
        ],
      },
      headers: {},
    };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.body.messages[0].content).toBe('Contact david.p@novus-tech.com');
    expect(next).toHaveBeenCalledWith();
  });

  it('should skip if no scopeId found', async () => {
    const guard = createMockGuard();
    const middleware = createExpressMiddleware(guard);

    const req = { body: {}, headers: {} };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(guard.redact).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('should use custom scopeResolver', async () => {
    const guard = createMockGuard();
    const middleware = createExpressMiddleware(guard, {
      scopeResolver: (req) => req.body.projectId,
    });

    const req = {
      body: {
        projectId: 'proj_1',
        messages: [{ role: 'user', content: 'john@acme.com' }],
      },
      headers: {},
    };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(guard.redact).toHaveBeenCalledWith('john@acme.com', { scopeId: 'proj_1' });
  });

  it('should use x-user-id header as fallback scope', async () => {
    const guard = createMockGuard();
    const middleware = createExpressMiddleware(guard);

    const req = {
      body: {
        messages: [{ role: 'user', content: 'john@acme.com' }],
      },
      headers: { 'x-user-id': 'header_user' },
    };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(guard.redact).toHaveBeenCalledWith('john@acme.com', { scopeId: 'header_user' });
  });

  it('should handle non-string message content', async () => {
    const guard = createMockGuard();
    const middleware = createExpressMiddleware(guard);

    const req = {
      body: {
        userId: 'user_1',
        messages: [
          { role: 'user', content: ['array content'] }, // not a string
        ],
      },
      headers: {},
    };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(guard.redact).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('should handle custom message fields', async () => {
    const guard = createMockGuard();
    const middleware = createExpressMiddleware(guard, {
      messageFields: ['chatHistory'],
    });

    const req = {
      body: {
        userId: 'user_1',
        chatHistory: [
          { role: 'user', content: 'john@acme.com' },
        ],
        messages: [
          { role: 'user', content: 'should not be touched' },
        ],
      },
      headers: {},
    };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);

    // chatHistory should be redacted
    expect(req.body.chatHistory[0].content).toBe('david.p@novus-tech.com');
    // messages should not be touched (not in messageFields)
    expect(req.body.messages[0].content).toBe('should not be touched');
  });

  it('should call next with error on failure', async () => {
    const guard = createMockGuard();
    const error = new Error('redaction failed');
    (guard.redact as any).mockRejectedValueOnce(error);

    const middleware = createExpressMiddleware(guard);

    const req = {
      body: {
        userId: 'user_1',
        messages: [{ role: 'user', content: 'test' }],
      },
      headers: {},
    };
    const res = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
