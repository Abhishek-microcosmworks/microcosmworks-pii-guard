import type { PIIGuard } from '../PIIGuard.js';
type Request = any;
type Response = any;
type NextFunction = (err?: any) => void;
export declare function createExpressMiddleware(guard: PIIGuard, opts?: {
    scopeResolver?: (req: Request) => string;
    messageFields?: string[];
}): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export {};
