import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { htmlToText } from 'html-to-text';

export const runtime = 'nodejs';

const SUPPORTED_TYPES: Record<string, { label: string; extractor: (file: File, buffer: Buffer) => Promise<string> }> = {
  'text/plain': {
    label: 'Plain Text',
    extractor: async (_file, buffer) => buffer.toString('utf-8'),
  },
  'application/json': {
    label: 'JSON',
    extractor: async (_file, buffer) => {
      try {
        const asString = buffer.toString('utf-8');
        const parsed = JSON.parse(asString);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return buffer.toString('utf-8');
      }
    },
  },
  'text/csv': {
    label: 'CSV',
    extractor: async (_file, buffer) => buffer.toString('utf-8'),
  },
  'text/html': {
    label: 'HTML',
    extractor: async (_file, buffer) => htmlToText(buffer.toString('utf-8'), { wordwrap: 120 }),
  },
  'application/pdf': {
    label: 'PDF',
    extractor: async (_file, buffer) => {
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        return parsed.text;
      } finally {
        await parser.destroy();
      }
    },
  },
};

const FALLBACK_EXTENSIONS: Record<string, keyof typeof SUPPORTED_TYPES> = {
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.pdf': 'application/pdf',
};

const MAX_CHARS = 12000;

interface AiPayload {
  lieProbability: number;
  confidenceScore: number;
  summary: string;
  cues: Array<{ label: string; value: string; risk: 'Baseline' | 'Elevated' | 'Critical'; detail: string }>;
  evidence: Array<{ quote: string; rationale: string }>;
  metrics: Array<{ label: string; value: string; hint: string }>;
}

const buildPrompt = (transcript: string, fileName: string) => {
  return `You are "OP-6 Veracity Oracle", a senior forensic linguistics engine assisting counter-intelligence teams.\n\nAnalyze the provided conversation transcript to estimate deception risk. You must respond in **strict JSON** with the following TypeScript schema:\n\ninterface AnalysisResponse {\n  lieProbability: number; // integer 0-100 representing deception likelihood\n  confidenceScore: number; // integer 0-100 representing your confidence\n  summary: string; // 2-3 sentence forensic style overview\n  cues: Array<{\n    label: string; // short cue name\n    value: string; // formatted measurement\n    risk: 'Baseline' | 'Elevated' | 'Critical';\n    detail: string; // one sentence rationale\n  }>;\n  evidence: Array<{\n    quote: string; // direct quote from transcript\n    rationale: string; // why this quote indicates risk\n  }>;\n  metrics: Array<{\n    label: string;\n    value: string;\n    hint: string;\n  }>;\n}\n\nGuidelines:\n- Include 3-5 cues prioritizing hedging, contradictions, pressure language, temporal drift, or numeric inconsistencies.\n- Evidence array must contain 2-4 direct **verbatim** quotes enclosed in double quotes, trimmed for brevity.\n- Keep summary authoritative and technical.\n- Ensure lieProbability and confidenceScore are integers.\n- If transcript is too short for analysis, set lieProbability to 12 and describe the limitation.\n- Never add additional fields or text outside JSON.\n\nFile Name: ${fileName}\nTranscript:\n"""\n${transcript}\n"""`;
};

const createPreview = (text: string) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 480 ? `${normalized.slice(0, 480)}…` : normalized;
};

const failure = (message: string, status = 400) =>
  NextResponse.json({ success: false, error: message }, { status });

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return failure('파일이 전송되지 않았습니다.');
  }

  const declaredType = file.type;
  const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const fallbackType = FALLBACK_EXTENSIONS[extension];

  const matchedType = declaredType && SUPPORTED_TYPES[declaredType] ? declaredType : fallbackType;

  if (!matchedType || !SUPPORTED_TYPES[matchedType]) {
    return failure('지원되지 않는 파일 형식입니다. txt, json, csv, html, pdf만 허용됩니다.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let extracted = await SUPPORTED_TYPES[matchedType].extractor(file, buffer);
  extracted = extracted.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();

  if (!extracted) {
    return failure('파일에서 텍스트를 추출할 수 없습니다.');
  }

  if (extracted.length > MAX_CHARS) {
    extracted = extracted.slice(0, MAX_CHARS);
  }

  const apiKey = process.env.GITHUB_MODELS_TOKEN;

  if (!apiKey) {
    return failure('서버에 GitHub Models API 토큰이 설정되어 있지 않습니다.', 500);
  }

  const prompt = buildPrompt(extracted, file.name);

  const response = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4.1',
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: 'system', content: 'You are a forensic deception analysis model that only returns strict JSON.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return failure(`GitHub Models 호출 실패: ${errorText}`, 502);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    return failure('AI 응답을 해석할 수 없습니다.', 502);
  }

  let parsed: AiPayload;

  try {
    parsed = JSON.parse(content) as AiPayload;
  } catch (error) {
    return failure(`AI 응답이 JSON 형식이 아닙니다: ${(error as Error).message}`, 502);
  }

  return NextResponse.json({
    success: true,
    analysis: parsed,
    preview: createPreview(extracted),
  });
}
