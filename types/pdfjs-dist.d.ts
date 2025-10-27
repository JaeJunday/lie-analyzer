declare module 'pdfjs-dist/legacy/build/pdf' {
  export const GlobalWorkerOptions: {
    workerSrc?: string;
  };

  export interface PDFPageProxy {
    getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
    cleanup?: () => void;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    cleanup?: () => void;
  }

  export function getDocument(parameters: {
    data: Uint8Array;
  }): {
    promise: Promise<PDFDocumentProxy>;
  };
}
