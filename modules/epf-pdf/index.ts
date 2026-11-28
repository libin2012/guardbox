import { requireOptionalNativeModule } from 'expo';

export type PdfTextResult =
  | { status: 'ok'; pages: string[][]; text: string }
  | { status: 'password_required' }
  | { status: 'wrong_password' };

interface EpfPdfNative {
  extractText(uri: string, password: string | null): Promise<PdfTextResult>;
}

const native = requireOptionalNativeModule<EpfPdfNative>('EpfPdf');

/** True when the on-device PDF reader is built into this app binary. */
export const pdfReaderAvailable = native != null;

/**
 * Extract text from a local PDF on the device (PDFKit on iOS).
 * Needs a development or release build; Expo Go does not include this module.
 */
export async function extractPdfText(uri: string, password?: string): Promise<PdfTextResult> {
  if (!native) {
    throw new Error('Reading PDFs needs the GuardBox app build (it is not available in Expo Go or on the web).');
  }
  return native.extractText(uri, password ? password : null);
}
