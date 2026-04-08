import { PIIType } from './types.js';
export const DEFAULT_PATTERNS = [
    // Email
    {
        type: PIIType.EMAIL,
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        confidence: 0.95,
        documentTypes: ['general', 'medical', 'financial'],
    },
    // US Phone (various formats)
    {
        type: PIIType.PHONE,
        pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        confidence: 0.85,
        documentTypes: ['general', 'medical', 'financial'],
    },
    // International phone
    {
        type: PIIType.PHONE,
        pattern: /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
        confidence: 0.8,
        documentTypes: ['general', 'medical', 'financial'],
    },
    // US SSN
    {
        type: PIIType.SSN,
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        confidence: 0.95,
        documentTypes: ['general', 'medical', 'financial'],
    },
    // Credit card (16 digits, various separators)
    {
        type: PIIType.CREDIT_CARD,
        pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
        confidence: 0.9,
        documentTypes: ['general', 'financial'],
    },
    // Date of birth (with label)
    {
        type: PIIType.DATE_OF_BIRTH,
        pattern: /\b(?:DOB|Date of Birth|Birth Date|Born)[:\s]+(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/gi,
        confidence: 0.9,
        documentTypes: ['general', 'medical', 'financial'],
    },
    // Medical record number
    {
        type: PIIType.MEDICAL_RECORD,
        pattern: /\b(?:MRN|Medical Record|Med Rec)[:\s#-]*([A-Z0-9-]{6,15})\b/gi,
        confidence: 0.85,
        documentTypes: ['medical'],
    },
    // ICD-10 Diagnosis codes
    {
        type: PIIType.DIAGNOSIS_CODE,
        pattern: /\b[A-Z]\d{2}(?:\.\d{1,4})?\b/g,
        confidence: 0.7,
        documentTypes: ['medical'],
    },
    // Insurance ID
    {
        type: PIIType.INSURANCE_ID,
        pattern: /\b(?:Insurance|Policy|Member)\s*(?:ID|#|No\.?)[:\s]*([A-Z0-9-]{6,20})\b/gi,
        confidence: 0.85,
        documentTypes: ['medical', 'financial'],
    },
    // Medication with dosage
    {
        type: PIIType.MEDICATION,
        pattern: /\b(?:prescribed|taking|medication|rx)[:\s]+([A-Za-z]+\s+\d+\s*(?:mg|mcg|ml|units?))\b/gi,
        confidence: 0.75,
        documentTypes: ['medical'],
    },
    // Bank account / routing / IBAN
    {
        type: PIIType.BANK_DETAILS,
        pattern: /\b(?:IBAN|Account|Routing|SWIFT|BIC)[:\s#-]*([A-Z0-9]{8,34})\b/gi,
        confidence: 0.85,
        documentTypes: ['financial'],
    },
    // Address (basic US-style street address)
    {
        type: PIIType.ADDRESS,
        pattern: /\b\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Pl|Place|Way|Cir|Circle)\.?\b/g,
        confidence: 0.75,
        documentTypes: ['general', 'medical', 'financial'],
    },
    // Account number (generic)
    {
        type: PIIType.ACCOUNT_NUMBER,
        pattern: /\b(?:Account|Acct)[:\s#-]*(\d{8,17})\b/gi,
        confidence: 0.8,
        documentTypes: ['general', 'financial'],
    },
];
