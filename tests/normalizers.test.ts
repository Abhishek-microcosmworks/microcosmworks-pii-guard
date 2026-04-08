import { describe, it, expect } from 'vitest';
import { normalize, stripMarkdown } from '../src/normalizers.js';
import { PIIType } from '../src/types.js';

describe('stripMarkdown', () => {
  it('should strip bold (**text**)', () => {
    expect(stripMarkdown('**John Doe**')).toBe('John Doe');
  });

  it('should strip underline bold (__text__)', () => {
    expect(stripMarkdown('__John Doe__')).toBe('John Doe');
  });

  it('should strip italic (*text*)', () => {
    expect(stripMarkdown('*John Doe*')).toBe('John Doe');
  });

  it('should strip italic (_text_)', () => {
    expect(stripMarkdown('_John Doe_')).toBe('John Doe');
  });

  it('should strip code (`text`)', () => {
    expect(stripMarkdown('`123-45-6789`')).toBe('123-45-6789');
  });

  it('should strip strikethrough (~~text~~)', () => {
    expect(stripMarkdown('~~old value~~')).toBe('old value');
  });

  it('should not alter plain text', () => {
    expect(stripMarkdown('John Doe')).toBe('John Doe');
  });

  it('should trim whitespace', () => {
    expect(stripMarkdown('  John Doe  ')).toBe('John Doe');
  });
});

describe('normalize', () => {
  describe('SSN', () => {
    it('should strip dashes', () => {
      expect(normalize('123-45-6789', PIIType.SSN)).toBe('123456789');
    });

    it('should strip spaces', () => {
      expect(normalize('123 45 6789', PIIType.SSN)).toBe('123456789');
    });

    it('should handle no separators', () => {
      expect(normalize('123456789', PIIType.SSN)).toBe('123456789');
    });

    it('should strip en-dashes', () => {
      expect(normalize('123\u201345\u20136789', PIIType.SSN)).toBe('123456789');
    });

    it('should handle markdown-wrapped SSN', () => {
      expect(normalize('**123-45-6789**', PIIType.SSN)).toBe('123456789');
    });
  });

  describe('PHONE', () => {
    it('should strip formatting and keep digits', () => {
      expect(normalize('555-123-4567', PIIType.PHONE)).toBe('5551234567');
    });

    it('should handle parentheses format', () => {
      expect(normalize('(555) 123-4567', PIIType.PHONE)).toBe('5551234567');
    });

    it('should handle dots format', () => {
      expect(normalize('555.123.4567', PIIType.PHONE)).toBe('5551234567');
    });

    it('should preserve leading + for international', () => {
      expect(normalize('+1-555-123-4567', PIIType.PHONE)).toBe('+15551234567');
    });

    it('should preserve + even with spaces', () => {
      expect(normalize('+ 1 555 123 4567', PIIType.PHONE)).toBe('+15551234567');
    });
  });

  describe('EMAIL', () => {
    it('should lowercase', () => {
      expect(normalize('John@ACME.COM', PIIType.EMAIL)).toBe('john@acme.com');
    });

    it('should trim whitespace', () => {
      expect(normalize('  john@acme.com  ', PIIType.EMAIL)).toBe('john@acme.com');
    });

    it('should handle markdown-wrapped email', () => {
      expect(normalize('**John@ACME.COM**', PIIType.EMAIL)).toBe('john@acme.com');
    });
  });

  describe('CREDIT_CARD', () => {
    it('should strip dashes', () => {
      expect(normalize('4000-1234-5678-9012', PIIType.CREDIT_CARD)).toBe('4000123456789012');
    });

    it('should strip spaces', () => {
      expect(normalize('4000 1234 5678 9012', PIIType.CREDIT_CARD)).toBe('4000123456789012');
    });

    it('should handle no separators', () => {
      expect(normalize('4000123456789012', PIIType.CREDIT_CARD)).toBe('4000123456789012');
    });
  });

  describe('NAME', () => {
    it('should lowercase', () => {
      expect(normalize('JOHN DOE', PIIType.NAME)).toBe('john doe');
    });

    it('should collapse whitespace', () => {
      expect(normalize('John   Doe', PIIType.NAME)).toBe('john doe');
    });

    it('should trim', () => {
      expect(normalize('  John Doe  ', PIIType.NAME)).toBe('john doe');
    });
  });

  describe('DATE_OF_BIRTH', () => {
    it('should strip to digits (slash format)', () => {
      expect(normalize('01/15/1990', PIIType.DATE_OF_BIRTH)).toBe('01151990');
    });

    it('should strip to digits (dash format)', () => {
      expect(normalize('1990-01-15', PIIType.DATE_OF_BIRTH)).toBe('19900115');
    });

    it('should strip to digits (dot format)', () => {
      expect(normalize('15.01.1990', PIIType.DATE_OF_BIRTH)).toBe('15011990');
    });
  });

  describe('ADDRESS', () => {
    it('should lowercase and collapse whitespace', () => {
      expect(normalize('123  Main  St', PIIType.ADDRESS)).toBe('123 main st');
    });
  });

  describe('ACCOUNT_NUMBER / BANK_DETAILS', () => {
    it('should strip to digits for ACCOUNT_NUMBER', () => {
      expect(normalize('1234-5678-9012', PIIType.ACCOUNT_NUMBER)).toBe('123456789012');
    });

    it('should strip to digits for BANK_DETAILS', () => {
      expect(normalize('12 3456 7890', PIIType.BANK_DETAILS)).toBe('1234567890');
    });
  });

  describe('MEDICAL_RECORD', () => {
    it('should prefix MRN and strip to digits', () => {
      expect(normalize('MRN-12345', PIIType.MEDICAL_RECORD)).toBe('MRN12345');
    });

    it('should handle just digits', () => {
      expect(normalize('12345', PIIType.MEDICAL_RECORD)).toBe('MRN12345');
    });
  });

  describe('default (unknown type)', () => {
    it('should return stripped markdown value unchanged', () => {
      expect(normalize('**some value**', PIIType.CUSTOM)).toBe('some value');
    });

    it('should return plain value unchanged', () => {
      expect(normalize('some value', PIIType.CUSTOM)).toBe('some value');
    });
  });
});
