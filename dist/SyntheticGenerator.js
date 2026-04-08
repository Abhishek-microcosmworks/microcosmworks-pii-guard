import { createHmac } from 'node:crypto';
import { PIIType } from './types.js';
import { FAKE_CARD_BINS, SSN_AREA_RANGE, SSN_GROUP_RANGE, SSN_SERIAL_RANGE } from './pools/formats.js';
export class SyntheticGenerator {
    pools;
    salt;
    constructor(pools, salt) {
        this.pools = pools;
        this.salt = salt;
    }
    /** Generate a synthetic value for a PII entity, deterministic via HMAC-SHA256 */
    generate(entity, scopeId) {
        const seed = this.hash(entity.value, scopeId);
        switch (entity.type) {
            case PIIType.NAME:
                return this.generateName(entity.context, seed);
            case PIIType.EMAIL:
                return this.generateEmail('', entity.context, seed);
            case PIIType.PHONE:
                return this.generatePhone(entity.context, seed);
            case PIIType.SSN:
                return this.generateSSN(seed);
            case PIIType.CREDIT_CARD:
                return this.generateCreditCard(seed);
            case PIIType.DATE_OF_BIRTH:
                return this.generateDate(entity.value, seed);
            case PIIType.ADDRESS:
                return this.generateAddress(seed);
            case PIIType.MEDICAL_RECORD:
                return this.generateMedicalRecord(seed);
            case PIIType.ACCOUNT_NUMBER:
            case PIIType.BANK_DETAILS:
                return this.generateAccountNumber(seed);
            default:
                // For unsupported types, generate a hash-based replacement
                return `[REDACTED-${seed.subarray(0, 4).toString('hex').toUpperCase()}]`;
        }
    }
    /** Generate a coherent email from a synthetic name + context */
    generateEmail(syntheticName, context, seed) {
        const s = seed || this.hashRaw('email-gen');
        const idx = this.seedToIndex(s, 0);
        let localPart;
        if (syntheticName) {
            const parts = syntheticName.toLowerCase().split(/\s+/);
            const formats = [
                () => `${parts[0]}.${parts[parts.length - 1]?.[0] || 'x'}`,
                () => `${parts[0][0]}.${parts[parts.length - 1] || 'user'}`,
                () => `${parts[0]}_${parts[parts.length - 1] || 'user'}`,
                () => `${parts[0]}${idx % 100}`,
            ];
            localPart = formats[idx % formats.length]();
        }
        else {
            const firstName = this.pickFromPool(this.pools.neutralFirstNames, s, 0);
            const surname = this.pickFromPool(this.pools.surnames, s, 1);
            localPart = `${firstName.toLowerCase()}.${surname[0]?.toLowerCase() || 'x'}`;
        }
        let domain;
        if (context.subtype === 'personal') {
            domain = this.pickFromPool(this.pools.personalDomains, s, 2);
        }
        else {
            domain = this.pickFromPool(this.pools.corporateDomains, s, 2);
        }
        return `${localPart}@${domain}`;
    }
    /** Generate a phone number preserving format/country */
    generatePhone(context, seed) {
        const mid = this.seedToRange(seed, 0, 100, 999);
        const last = this.seedToRange(seed, 1, 1000, 9999);
        if (context.format === 'UK') {
            const area = this.seedToRange(seed, 2, 20, 99);
            return `+44 ${area} ${mid.toString().padStart(4, '0').slice(0, 4)} ${last.toString().slice(0, 4)}`;
        }
        if (context.format === 'international') {
            const area = this.seedToRange(seed, 2, 10, 99);
            return `+${area} ${mid}-${last}`;
        }
        // Default US format
        return `555-${mid.toString().padStart(3, '0')}-${last.toString().padStart(4, '0')}`;
    }
    /** Generate a date preserving approximate decade */
    generateDate(originalPattern, seed) {
        // Try to parse the year from original
        const yearMatch = originalPattern.match(/(\d{4})/);
        const origYear = yearMatch ? parseInt(yearMatch[1], 10) : 1990;
        // Generate a date in the same decade
        const yearOffset = this.seedToRange(seed, 0, -2, 5);
        const month = this.seedToRange(seed, 1, 1, 12);
        const day = this.seedToRange(seed, 2, 1, 28);
        const newYear = origYear + yearOffset;
        // Preserve the original format
        const monthStr = month.toString().padStart(2, '0');
        const dayStr = day.toString().padStart(2, '0');
        if (originalPattern.includes('-')) {
            return `${monthStr}-${dayStr}-${newYear}`;
        }
        return `${monthStr}/${dayStr}/${newYear}`;
    }
    /** Generate an SSN in known-invalid 900+ range */
    generateSSN(seed) {
        const area = this.seedToRange(seed, 0, SSN_AREA_RANGE.min, SSN_AREA_RANGE.max);
        const group = this.seedToRange(seed, 1, SSN_GROUP_RANGE.min, SSN_GROUP_RANGE.max);
        const serial = this.seedToRange(seed, 2, SSN_SERIAL_RANGE.min, SSN_SERIAL_RANGE.max);
        return `${area}-${group}-${serial}`;
    }
    /** Generate a credit card with valid Luhn but non-issuable BIN */
    generateCreditCard(seed) {
        const binIdx = this.seedToIndex(seed, 0) % FAKE_CARD_BINS.length;
        const bin = FAKE_CARD_BINS[binIdx];
        // Generate middle digits
        let digits = bin;
        for (let i = bin.length; i < 15; i++) {
            digits += this.seedToRange(seed, i, 0, 9).toString();
        }
        // Calculate Luhn check digit
        const checkDigit = this.luhnCheckDigit(digits);
        digits += checkDigit;
        // Format as XXXX-XXXX-XXXX-XXXX
        return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}`;
    }
    // --- Internal helpers ---
    generateName(context, seed) {
        let firstName;
        if (context.genderHint === 'male') {
            firstName = this.pickFromPool(this.pools.maleFirstNames, seed, 0);
        }
        else if (context.genderHint === 'female') {
            firstName = this.pickFromPool(this.pools.femaleFirstNames, seed, 0);
        }
        else {
            firstName = this.pickFromPool(this.pools.neutralFirstNames, seed, 0);
        }
        const surname = this.pickFromPool(this.pools.surnames, seed, 1);
        return `${firstName} ${surname}`;
    }
    generateAddress(seed) {
        return this.pickFromPool(this.pools.streetNames, seed, 0);
    }
    generateMedicalRecord(seed) {
        const num = this.seedToRange(seed, 0, 10000000, 99999999);
        return `MRN-${num.toString().padStart(8, '0')}`;
    }
    generateAccountNumber(seed) {
        let num = '';
        for (let i = 0; i < 12; i++) {
            num += this.seedToRange(seed, i, 0, 9).toString();
        }
        return num;
    }
    /** HMAC-SHA256 hash producing a deterministic seed buffer */
    hash(value, scopeId) {
        return createHmac('sha256', this.salt + scopeId)
            .update(value)
            .digest();
    }
    hashRaw(value) {
        return createHmac('sha256', this.salt)
            .update(value)
            .digest();
    }
    /** Pick a value from a pool using seed bytes */
    pickFromPool(pool, seed, byteOffset) {
        const index = this.seedToIndex(seed, byteOffset) % pool.length;
        return pool[index];
    }
    /** Convert seed bytes to a positive index */
    seedToIndex(seed, byteOffset) {
        const offset = (byteOffset * 4) % (seed.length - 3);
        return seed.readUInt32BE(offset);
    }
    /** Convert seed bytes to a value within a range */
    seedToRange(seed, byteOffset, min, max) {
        const idx = this.seedToIndex(seed, byteOffset);
        return min + (idx % (max - min + 1));
    }
    /** Calculate Luhn check digit for a card number string (without the check digit) */
    luhnCheckDigit(digits) {
        let sum = 0;
        let alternate = true; // start from rightmost (which will be the check digit position)
        for (let i = digits.length - 1; i >= 0; i--) {
            let n = parseInt(digits[i], 10);
            if (alternate) {
                n *= 2;
                if (n > 9)
                    n -= 9;
            }
            sum += n;
            alternate = !alternate;
        }
        return ((10 - (sum % 10)) % 10).toString();
    }
}
