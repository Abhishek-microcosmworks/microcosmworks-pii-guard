/**
 * Strip common markdown formatting that LLMs wrap around values.
 * Handles: **bold**, __underline__, *italic*, _italic_, `code`, ~~strikethrough~~
 */
export declare function stripMarkdown(value: string): string;
/**
 * Normalize a PII value to a canonical form for comparison.
 * Two values that represent the same PII (regardless of formatting) normalize to the same string.
 */
export declare function normalize(value: string, entityType: string): string;
