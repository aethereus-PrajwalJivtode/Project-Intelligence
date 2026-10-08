
export interface ExtractedDocument {
  id: string;
  name: string;
  mediaType: 'text' | 'docx' | 'pdf';
  size: number;
  content: string;
}

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_DOCUMENT_CHARACTERS = 500_000;

function assertReadableContent(content: string, fileName: string): string {
  const normalized = content.replace(/\u0000/g, '').trim();
  if (!normalized) {
    throw new Error(`${fileName} contains no extractable text. Scanned PDFs need OCR before they can be analyzed.`);
  }
  if (normalized.length > MAX_DOCUMENT_CHARACTERS) {
    throw new Error(`${fileName} exceeds the ${MAX_DOCUMENT_CHARACTERS.toLocaleString()} character analysis limit. Split the document and attach smaller sections.`);
  }
  return normalized;
}

function addSourceMarkers(text: string, fileName: string, label: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => line.trim() ? `[${fileName} ${label} ${index + 1}] ${line.trim()}` : '')
    .filter(Boolean)
    .join('\n');
}

async function extractPdf(file: File): Promise<string> {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item): item is typeof item & { str: string } => 'str' in item)
        .map((item) => item.str)
        .join(' ')
        .trim();
      if (pageText) pages.push(`[${file.name} page ${pageNumber}] ${pageText}`);
    }
    return pages.join('\n');
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} exceeds the 12 MB per-file limit.`);
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  let mediaType: ExtractedDocument['mediaType'];
  let content: string;

  if (extension === 'txt' || extension === 'text') {
    mediaType = 'text';
    const text = await file.text();
    content = addSourceMarkers(assertReadableContent(text, file.name), file.name, 'line');
  } else if (extension === 'docx') {
    mediaType = 'docx';
    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default;
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const paragraphs = assertReadableContent(result.value, file.name);
    content = addSourceMarkers(paragraphs, file.name, 'paragraph');
  } else if (extension === 'pdf') {
    mediaType = 'pdf';
    content = assertReadableContent(await extractPdf(file), file.name);
  } else {
    throw new Error(`${file.name} is not supported. Attach TXT, DOCX, or PDF files.`);
  }

  if (content.length > MAX_DOCUMENT_CHARACTERS) {
    throw new Error(`${file.name} exceeds the ${MAX_DOCUMENT_CHARACTERS.toLocaleString()} character analysis limit. Split the document and attach smaller sections.`);
  }

  return {
    id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    mediaType,
    size: file.size,
    content,
  };
}