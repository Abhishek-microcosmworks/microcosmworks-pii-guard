import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AWSComprehendProvider } from '../src/detection/AWSComprehendProvider.js';
import { PIIType } from '../src/types.js';

// Mock the AWS SDK
vi.mock('@aws-sdk/client-comprehend', () => {
  const mockSend = vi.fn();
  const mockDestroy = vi.fn();

  return {
    ComprehendClient: vi.fn().mockImplementation(() => ({
      send: mockSend,
      destroy: mockDestroy,
    })),
    DetectPiiEntitiesCommand: vi.fn().mockImplementation((input: any) => ({
      input,
    })),
    __mockSend: mockSend,
    __mockDestroy: mockDestroy,
  };
});

async function getMockSend() {
  const mod = await import('@aws-sdk/client-comprehend') as any;
  return mod.__mockSend as ReturnType<typeof vi.fn>;
}

describe('AWSComprehendProvider', () => {
  let provider: AWSComprehendProvider;

  beforeEach(async () => {
    const mockSend = await getMockSend();
    mockSend.mockReset();

    provider = new AWSComprehendProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
  });

  it('should have the correct name', () => {
    expect(provider.name).toBe('aws-comprehend');
  });

  it('should detect PII entities and map types correctly', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({
      Entities: [
        { Type: 'NAME', BeginOffset: 0, EndOffset: 8, Score: 0.95 },
        { Type: 'EMAIL', BeginOffset: 10, EndOffset: 26, Score: 0.99 },
        { Type: 'PHONE', BeginOffset: 31, EndOffset: 43, Score: 0.92 },
      ],
    });

    const text = 'John Doe (john@acme.com) at 555-123-4567';
    const entities = await provider.detect(text);

    expect(entities).toHaveLength(3);

    // NAME -> PIIType.NAME
    expect(entities[0].type).toBe(PIIType.NAME);
    expect(entities[0].value).toBe('John Doe');
    expect(entities[0].confidence).toBe(0.95);
    expect(entities[0].startIndex).toBe(0);
    expect(entities[0].endIndex).toBe(8);

    // EMAIL -> PIIType.EMAIL
    expect(entities[1].type).toBe(PIIType.EMAIL);
    expect(entities[1].value).toBe('john@acme.com) a');
    expect(entities[1].confidence).toBe(0.99);

    // PHONE -> PIIType.PHONE
    expect(entities[2].type).toBe(PIIType.PHONE);
    expect(entities[2].confidence).toBe(0.92);
  });

  it('should filter entities below minConfidence', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({
      Entities: [
        { Type: 'NAME', BeginOffset: 0, EndOffset: 8, Score: 0.95 },
        { Type: 'ADDRESS', BeginOffset: 10, EndOffset: 30, Score: 0.5 }, // below threshold
      ],
    });

    const entities = await provider.detect('John Doe, 123 Main Street', {
      minConfidence: 0.8,
    });

    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe(PIIType.NAME);
  });

  it('should use configured minConfidence by default', async () => {
    const highConfProvider = new AWSComprehendProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      minConfidence: 0.95,
    });

    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({
      Entities: [
        { Type: 'NAME', BeginOffset: 0, EndOffset: 4, Score: 0.92 }, // below 0.95
        { Type: 'EMAIL', BeginOffset: 5, EndOffset: 20, Score: 0.99 },
      ],
    });

    const entities = await highConfProvider.detect('John john@example.com');

    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe(PIIType.EMAIL);
  });

  it('should map all known AWS Comprehend entity types', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({
      Entities: [
        { Type: 'SSN_ITIN', BeginOffset: 0, EndOffset: 11, Score: 0.99 },
        { Type: 'CREDIT_DEBIT_NUMBER', BeginOffset: 12, EndOffset: 31, Score: 0.98 },
        { Type: 'BANK_ACCOUNT_NUMBER', BeginOffset: 32, EndOffset: 44, Score: 0.97 },
        { Type: 'DATE_TIME', BeginOffset: 45, EndOffset: 55, Score: 0.90 },
      ],
    });

    const text = '123-45-6789 4000001234567890 123456789012 01/15/1990';
    const entities = await provider.detect(text);

    expect(entities).toHaveLength(4);
    expect(entities[0].type).toBe(PIIType.SSN);
    expect(entities[1].type).toBe(PIIType.CREDIT_CARD);
    expect(entities[2].type).toBe(PIIType.BANK_DETAILS);
    expect(entities[3].type).toBe(PIIType.DATE_OF_BIRTH);
  });

  it('should include provider metadata', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({
      Entities: [
        { Type: 'NAME', BeginOffset: 0, EndOffset: 8, Score: 0.95 },
      ],
    });

    const entities = await provider.detect('John Doe');

    expect(entities[0].providerMetadata).toEqual({
      awsEntityType: 'NAME',
      awsScore: 0.95,
    });
  });

  it('should skip unmapped entity types', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({
      Entities: [
        { Type: 'NAME', BeginOffset: 0, EndOffset: 4, Score: 0.95 },
        { Type: 'TOTALLY_UNKNOWN_TYPE', BeginOffset: 5, EndOffset: 10, Score: 0.99 },
      ],
    });

    const entities = await provider.detect('John stuff');

    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe(PIIType.NAME);
  });

  it('should pass the configured language code', async () => {
    const esProvider = new AWSComprehendProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      languageCode: 'es',
    });

    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({ Entities: [] });

    await esProvider.detect('Juan Garcia vive en Madrid');

    const { DetectPiiEntitiesCommand } = await import('@aws-sdk/client-comprehend') as any;
    expect(DetectPiiEntitiesCommand).toHaveBeenCalledWith(
      expect.objectContaining({ LanguageCode: 'es' })
    );
  });

  it('should override language code with detection options', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({ Entities: [] });

    await provider.detect('Hans Mueller lebt in Berlin', { languageCode: 'de' });

    const { DetectPiiEntitiesCommand } = await import('@aws-sdk/client-comprehend') as any;
    expect(DetectPiiEntitiesCommand).toHaveBeenCalledWith(
      expect.objectContaining({ LanguageCode: 'de' })
    );
  });

  it('should handle empty Entities response', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({ Entities: [] });

    const entities = await provider.detect('No PII here.');
    expect(entities).toHaveLength(0);
  });

  it('should handle undefined Entities response', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({});

    const entities = await provider.detect('No PII here either.');
    expect(entities).toHaveLength(0);
  });

  it('should chunk large texts that exceed maxTextBytes', async () => {
    const smallByteProvider = new AWSComprehendProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      maxTextBytes: 50, // Very small limit for testing
    });

    const mockSend = await getMockSend();
    // First chunk response
    mockSend.mockResolvedValueOnce({
      Entities: [
        { Type: 'NAME', BeginOffset: 0, EndOffset: 8, Score: 0.95 },
      ],
    });
    // Second chunk response
    mockSend.mockResolvedValueOnce({
      Entities: [
        { Type: 'EMAIL', BeginOffset: 0, EndOffset: 16, Score: 0.99 },
      ],
    });

    const text = 'John Doe is a person who works at the company. john@example.com is his email address.';
    const entities = await smallByteProvider.detect(text);

    // Should have made 2+ API calls
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(entities.length).toBeGreaterThanOrEqual(1);
  });

  it('should shutdown gracefully', async () => {
    const mockSend = await getMockSend();
    mockSend.mockResolvedValueOnce({ Entities: [] });

    // Force client initialization
    await provider.detect('test');

    await provider.shutdown();

    const mod = await import('@aws-sdk/client-comprehend') as any;
    // The destroy method should have been called
    expect(mod.__mockDestroy).toHaveBeenCalled();
  });
});
