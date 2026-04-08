import { PIIType } from './types.js';
/**
 * Strip common markdown formatting that LLMs wrap around values.
 * Handles: **bold**, __underline__, *italic*, _italic_, `code`, ~~strikethrough~~
 */
export function stripMarkdown(value) {
    let v = value;
    // Bold: **text** or __text__
    v = v.replace(/^\*\*(.+)\*\*$/, '$1');
    v = v.replace(/^__(.+)__$/, '$1');
    // Italic: *text* or _text_
    v = v.replace(/^\*(.+)\*$/, '$1');
    v = v.replace(/^_(.+)_$/, '$1');
    // Code: `text`
    v = v.replace(/^`(.+)`$/, '$1');
    // Strikethrough: ~~text~~
    v = v.replace(/^~~(.+)~~$/, '$1');
    return v.trim();
}
/**
 * Normalize a PII value to a canonical form for comparison.
 * Two values that represent the same PII (regardless of formatting) normalize to the same string.
 */
export function normalize(value, entityType) {
    const unwrapped = stripMarkdown(value);
    switch (entityType) {
        case PIIType.SSN:
            return unwrapped.replace(/\D/g, '');
        case PIIType.PHONE: {
            const hasPlus = unwrapped.trimStart().startsWith('+');
            const digits = unwrapped.replace(/\D/g, '');
            return hasPlus ? `+${digits}` : digits;
        }
        case PIIType.EMAIL:
            return unwrapped.toLowerCase().trim();
        case PIIType.CREDIT_CARD:
            return unwrapped.replace(/\D/g, '');
        case PIIType.NAME:
            return unwrapped.toLowerCase().replace(/\s+/g, ' ').trim();
        case PIIType.DATE_OF_BIRTH:
            return unwrapped.replace(/\D/g, '');
        case PIIType.ADDRESS:
            return unwrapped.toLowerCase().replace(/\s+/g, ' ').trim();
        case PIIType.ACCOUNT_NUMBER:
        case PIIType.BANK_DETAILS:
            return unwrapped.replace(/\D/g, '');
        case PIIType.MEDICAL_RECORD: {
            const digits = unwrapped.replace(/\D/g, '');
            return `MRN${digits}`;
        }
        default:
            return unwrapped;
    }
}
