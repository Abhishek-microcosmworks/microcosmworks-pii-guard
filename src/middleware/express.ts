import type { PIIGuard } from '../PIIGuard.js';

type Request = any;
type Response = any;
type NextFunction = (err?: any) => void;

export function createExpressMiddleware(guard: PIIGuard, opts?: {
  scopeResolver?: (req: Request) => string;
  messageFields?: string[];
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scopeId = opts?.scopeResolver?.(req) || req.body?.userId || req.headers?.['x-user-id'];
      if (!scopeId) return next();

      const fields = opts?.messageFields || ['messages', 'sharedMemory'];

      for (const field of fields) {
        if (Array.isArray(req.body?.[field])) {
          req.body[field] = await Promise.all(
            req.body[field].map(async (msg: any) => {
              if (typeof msg.content !== 'string') return msg;
              const result = await guard.redact(msg.content, { scopeId });
              return { ...msg, content: result.text };
            })
          );
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
