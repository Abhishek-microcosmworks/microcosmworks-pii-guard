/**
 * Phone number format templates.
 * Uses 555-01xx through 555-09xx range (reserved for fictional use by NANPA).
 */
export const US_PHONE_PREFIXES = ['555'];
export const US_PHONE_MIDDLE_RANGE = { min: 100, max: 999 };
export const US_PHONE_LAST_RANGE = { min: 1000, max: 9999 };
/** Country codes for international phone generation */
export const COUNTRY_CODES = {
    US: { code: '+1', format: '{code} {area}-{mid}-{last}' },
    UK: { code: '+44', format: '{code} {area} {mid} {last}' },
    DE: { code: '+49', format: '{code} {area} {mid}{last}' },
    FR: { code: '+33', format: '{code} {area} {mid} {last}' },
    JP: { code: '+81', format: '{code} {area}-{mid}-{last}' },
    IN: { code: '+91', format: '{code} {area}{mid}{last}' },
    AU: { code: '+61', format: '{code} {area} {mid} {last}' },
    BR: { code: '+55', format: '{code} {area} {mid}-{last}' },
};
/**
 * SSN generation uses 900-999 range for area number.
 * IRS has reserved 900-999 area numbers as invalid / not issued.
 */
export const SSN_AREA_RANGE = { min: 900, max: 999 };
export const SSN_GROUP_RANGE = { min: 10, max: 99 };
export const SSN_SERIAL_RANGE = { min: 1000, max: 9999 };
/**
 * Credit card BIN ranges that are not assigned to any issuer.
 * Used for generating Luhn-valid but non-issuable card numbers.
 */
export const FAKE_CARD_BINS = [
    '400000', // Visa-like but not issued
    '510000', // Mastercard-like but not issued
    '340000', // Amex-like but not issued
    '601100', // Discover-like but not issued
];
