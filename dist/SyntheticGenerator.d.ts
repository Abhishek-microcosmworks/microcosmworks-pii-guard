import type { PIIEntity, PIIContext, SyntheticPools } from './types.js';
export declare class SyntheticGenerator {
    private pools;
    private salt;
    constructor(pools: SyntheticPools, salt: string);
    /** Generate a synthetic value for a PII entity, deterministic via HMAC-SHA256 */
    generate(entity: PIIEntity, scopeId: string): string;
    /** Generate a coherent email from a synthetic name + context */
    generateEmail(syntheticName: string, context: PIIContext, seed?: Buffer): string;
    /** Generate a phone number preserving format/country */
    generatePhone(context: PIIContext, seed: Buffer): string;
    /** Generate a date preserving approximate decade */
    generateDate(originalPattern: string, seed: Buffer): string;
    /** Generate an SSN in known-invalid 900+ range */
    generateSSN(seed: Buffer): string;
    /** Generate a credit card with valid Luhn but non-issuable BIN */
    generateCreditCard(seed: Buffer): string;
    private generateName;
    private generateAddress;
    private generateMedicalRecord;
    private generateAccountNumber;
    /** HMAC-SHA256 hash producing a deterministic seed buffer */
    private hash;
    private hashRaw;
    /** Pick a value from a pool using seed bytes */
    private pickFromPool;
    /** Convert seed bytes to a positive index */
    private seedToIndex;
    /** Convert seed bytes to a value within a range */
    private seedToRange;
    /** Calculate Luhn check digit for a card number string (without the check digit) */
    private luhnCheckDigit;
}
