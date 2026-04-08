import type { SupportedFileFormat, TextExtractionResult } from '../types.js';
/** Map a file extension to a SupportedFileFormat */
export declare function inferFormat(filePath: string): SupportedFileFormat;
/** Returns true for text-based formats that can be written back to disk */
export declare function isWritableFormat(format: SupportedFileFormat): boolean;
/** Write text content to a file */
export declare function writeTextFile(path: string, content: string, encoding?: BufferEncoding): Promise<void>;
/** Extract plain text from a file path or Buffer */
export declare function extractText(input: string | Buffer, opts?: {
    format?: SupportedFileFormat;
    encoding?: BufferEncoding;
}): Promise<TextExtractionResult>;
