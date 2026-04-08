/**
 * Phone number format templates.
 * Uses 555-01xx through 555-09xx range (reserved for fictional use by NANPA).
 */
export declare const US_PHONE_PREFIXES: string[];
export declare const US_PHONE_MIDDLE_RANGE: {
    min: number;
    max: number;
};
export declare const US_PHONE_LAST_RANGE: {
    min: number;
    max: number;
};
/** Country codes for international phone generation */
export declare const COUNTRY_CODES: Record<string, {
    code: string;
    format: string;
}>;
/**
 * SSN generation uses 900-999 range for area number.
 * IRS has reserved 900-999 area numbers as invalid / not issued.
 */
export declare const SSN_AREA_RANGE: {
    min: number;
    max: number;
};
export declare const SSN_GROUP_RANGE: {
    min: number;
    max: number;
};
export declare const SSN_SERIAL_RANGE: {
    min: number;
    max: number;
};
/**
 * Credit card BIN ranges that are not assigned to any issuer.
 * Used for generating Luhn-valid but non-issuable card numbers.
 */
export declare const FAKE_CARD_BINS: string[];
