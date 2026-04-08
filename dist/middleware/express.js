export function createExpressMiddleware(guard, opts) {
    return async (req, res, next) => {
        try {
            const scopeId = opts?.scopeResolver?.(req) || req.body?.userId || req.headers?.['x-user-id'];
            if (!scopeId)
                return next();
            const fields = opts?.messageFields || ['messages', 'sharedMemory'];
            for (const field of fields) {
                if (Array.isArray(req.body?.[field])) {
                    req.body[field] = await Promise.all(req.body[field].map(async (msg) => {
                        if (typeof msg.content !== 'string')
                            return msg;
                        const result = await guard.redact(msg.content, { scopeId });
                        return { ...msg, content: result.text };
                    }));
                }
            }
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
