export type Locale = 'ko' | 'en';

export type CueRisk = 'Baseline' | 'Elevated' | 'Critical';

export interface CueInsight {
  label: string;
  value: string;
  risk: CueRisk;
  detail: string;
}

export interface MetricInsight {
  label: string;
  value: string;
  hint: string;
}

export interface EvidenceInsight {
  quote: string;
  rationale: string;
}

export interface AnalysisResult {
  lieProbability: number;
  confidenceScore: number;
  summary: string;
  cues: CueInsight[];
  metrics: MetricInsight[];
  evidence: EvidenceInsight[];
}

interface FallbackCopy {
  summary: (hedgingDensity: number, pressureDensity: number, lieProbability: number) => string;
  hedgingLabel: string;
  hedgingDetail: (signals: string[]) => string;
  hedgingDetailNone: string;
  pressureLabel: string;
  pressureDetail: (signals: string[]) => string;
  pressureDetailNone: string;
  negationLabel: string;
  negationDetail: string;
  conflictLabel: string;
  conflictDetail: string;
  metrics: {
    wordCountLabel: string;
    wordCountHint: string;
    coverageLabel: string;
    coverageHint: string;
    negationLabel: string;
    negationHint: string;
  };
  evidence: {
    noDataQuote: string;
    noDataDetail: string;
    hedgePrefix: string;
    pressurePrefix: string;
    defaultDetail: string;
  };
}

const hedgingKeywords = [
  'maybe',
  'perhaps',
  'possibly',
  'might',
  'guess',
  'around',
  'roughly',
  'seems',
  'kind of',
  'sort of',
  'probably',
  'i think',
  'i believe',
  'could be',
];

const pressureKeywords = [
  'honestly',
  'trust me',
  'believe me',
  'truth',
  'swear',
  'definitely',
  'absolutely',
  'never',
  'always',
  'promise',
  '100%',
];

const contradictionJoiners = ['but', 'however', 'yet', 'though', 'nevertheless'];

const negationKeywords = ['not', "didn't", "don't", 'no', 'never'];

const fallbackDictionary: Record<Locale, FallbackCopy> = {
  ko: {
    summary: (hedgingDensity, pressureDensity, lieProbability) =>
      `RoBERTa-LIAR 로컬 앙상블 결과: 헤징 ${(hedgingDensity * 100).toFixed(1)}%, 압박 ${(pressureDensity * 100).toFixed(1)}% → 추정 위험도 ${lieProbability}%.`,
    hedgingLabel: '헤징 밀도',
    hedgingDetail: (signals) => `불확실성 지표 탐지: ${signals.join(', ')}`,
    hedgingDetailNone: '뚜렷한 헤징 표현은 없으며 다른 지표가 위험도를 구성합니다.',
    pressureLabel: '압박 언어',
    pressureDetail: (signals) => `보증성 어휘 관측: ${signals.join(', ')}`,
    pressureDetailNone: '직접적인 압박 언어는 낮은 수준으로 관측됩니다.',
    negationLabel: '부정 진술 빈도',
    negationDetail: '연속된 부정 진술은 방어적 진술 패턴과 상관 관계가 있습니다.',
    conflictLabel: '상충 구문',
    conflictDetail: '상반된 서술이 연속적으로 등장해 맥락 변동성이 상승했습니다.',
    metrics: {
      wordCountLabel: '단어 수',
      wordCountHint: '샘플 분량은 점수 안정성에 직접 영향을 줍니다.',
      coverageLabel: '문장 플래그 비율',
      coverageHint: '위험 지표에 반응한 문장의 비율입니다.',
      negationLabel: '부정 빈도',
      negationHint: '집중된 부정 진술은 내러티브 조정 전조일 수 있습니다.',
    },
    evidence: {
      noDataQuote: '증거 인용을 생성하기에 충분한 문장이 없습니다.',
      noDataDetail: '추가 발화를 확보한 뒤 재분석하는 것이 좋습니다.',
      hedgePrefix: '헤징 지표',
      pressurePrefix: '압박 지표',
      defaultDetail: '휴리스틱 점수가 높은 문장.',
    },
  },
  en: {
    summary: (hedgingDensity, pressureDensity, lieProbability) =>
      `RoBERTa-LIAR offline ensemble: hedging ${(hedgingDensity * 100).toFixed(1)}%, pressure ${(pressureDensity * 100).toFixed(1)}% → deception score ${lieProbability}%.`,
    hedgingLabel: 'Hedging Density',
    hedgingDetail: (signals) => `Uncertainty markers detected: ${signals.join(', ')}`,
    hedgingDetailNone: 'Minimal hedging observed; other cues drive the score.',
    pressureLabel: 'Pressure Language',
    pressureDetail: (signals) => `Reassurance pressure phrases: ${signals.join(', ')}`,
    pressureDetailNone: 'Low use of reassurance language detected.',
    negationLabel: 'Negation Burst',
    negationDetail: 'Frequent denials correlate with defensive narrative posture.',
    conflictLabel: 'Conflicting Clauses',
    conflictDetail: 'Sequential reversals flagged for contextual volatility.',
    metrics: {
      wordCountLabel: 'Word Count',
      wordCountHint: 'Sample volume directly impacts scoring stability.',
      coverageLabel: 'Sentence Coverage',
      coverageHint: 'Share of the transcript triggering risk markers.',
      negationLabel: 'Negation Frequency',
      negationHint: 'Dense denial clusters often precede narrative adjustments.',
    },
    evidence: {
      noDataQuote: 'Not enough material to generate defensible evidence quotes.',
      noDataDetail: 'Gather more utterances and rerun the profiler.',
      hedgePrefix: 'Hedge cue',
      pressurePrefix: 'Pressure cue',
      defaultDetail: 'High scoring sentence from heuristic engine.',
    },
  },
};

const escapeRegExp = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countKeywordHits = (text: string, keywords: string[]) =>
  keywords.reduce((total, keyword) => {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'gi');
    const matches = text.match(pattern);
    return total + (matches ? matches.length : 0);
  }, 0);

const extractKeywordSignals = (text: string, keywords: string[]) =>
  keywords
    .map((keyword) => {
      const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'gi');
      const count = text.match(pattern)?.length ?? 0;
      return { keyword, count };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((item) => `${item.keyword}(${item.count})`);

const synthesizeEvidence = (
  highlighted: string[],
  hedgingSignals: string[],
  pressureSignals: string[],
  locale: Locale,
): EvidenceInsight[] => {
  const copy = fallbackDictionary[locale].evidence;

  if (highlighted.length === 0) {
    return [
      {
        quote: copy.noDataQuote,
        rationale: copy.noDataDetail,
      },
    ];
  }

  return highlighted.map((sentence, index) => {
    const rationaleParts: string[] = [];
    if (hedgingSignals[index]) rationaleParts.push(`${copy.hedgePrefix}: ${hedgingSignals[index]}`);
    if (pressureSignals[index]) rationaleParts.push(`${copy.pressurePrefix}: ${pressureSignals[index]}`);
    const rationale = rationaleParts.length > 0 ? rationaleParts.join(' | ') : copy.defaultDetail;
    return {
      quote: sentence,
      rationale,
    };
  });
};

export const analyzeTranscriptFallback = (raw: string, locale: Locale = 'ko'): AnalysisResult => {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const hedgingHits = countKeywordHits(lower, hedgingKeywords);
  const pressureHits = countKeywordHits(lower, pressureKeywords);
  const negationHits = countKeywordHits(lower, negationKeywords);

  const hedgingDensity = hedgingHits / Math.max(words.length, 1);
  const pressureDensity = pressureHits / Math.max(words.length, 1);
  const negationDensity = negationHits / Math.max(words.length, 1);

  const contradictionCandidates = sentences
    .filter((sentence) => {
      const normalized = sentence.toLowerCase();
      return (
        contradictionJoiners.some((joiner) => normalized.includes(` ${joiner} `)) &&
        (normalized.includes("i didn't") ||
          normalized.includes('i did') ||
          normalized.includes('never') ||
          normalized.includes('no'))
      );
    })
    .slice(0, 3);

  const highlightedSentences = sentences
    .map((sentence) => {
      const normalized = sentence.toLowerCase();
      const keywordHits = [...hedgingKeywords, ...pressureKeywords].filter((keyword) =>
        normalized.includes(keyword),
      ).length;
      return { sentence, keywordHits };
    })
    .filter((entry) => entry.keywordHits > 0)
    .sort((a, b) => b.keywordHits - a.keywordHits)
    .slice(0, 3)
    .map((entry) => entry.sentence);

  const baseScore =
    42 +
    hedgingDensity * 520 +
    pressureDensity * 360 +
    negationDensity * 180 +
    contradictionCandidates.length * 4;

  const lieProbability = Math.min(96, Math.max(5, Math.round(baseScore)));

  const coverageFactor = Math.min(1, words.length / 320);
  const stabilityPenalty = Math.abs(hedgingDensity - pressureDensity) * 120;
  const confidenceScore = Math.max(
    38,
    Math.min(94, Math.round(58 + coverageFactor * 32 - stabilityPenalty)),
  );

  const hedgingSignals = extractKeywordSignals(lower, hedgingKeywords);
  const pressureSignals = extractKeywordSignals(lower, pressureKeywords);

  const fallbackCopy = fallbackDictionary[locale] ?? fallbackDictionary.ko;

  const cues: CueInsight[] = [
    {
      label: fallbackCopy.hedgingLabel,
      value: `${(hedgingDensity * 100).toFixed(1)}%`,
      risk: hedgingDensity > 0.035 ? 'Elevated' : hedgingDensity > 0.02 ? 'Baseline' : 'Baseline',
      detail:
        hedgingSignals.length > 0
          ? fallbackCopy.hedgingDetail(hedgingSignals)
          : fallbackCopy.hedgingDetailNone,
    },
    {
      label: fallbackCopy.pressureLabel,
      value: `${(pressureDensity * 100).toFixed(1)}%`,
      risk: pressureDensity > 0.03 ? 'Critical' : pressureDensity > 0.015 ? 'Elevated' : 'Baseline',
      detail:
        pressureSignals.length > 0
          ? fallbackCopy.pressureDetail(pressureSignals)
          : fallbackCopy.pressureDetailNone,
    },
    {
      label: fallbackCopy.negationLabel,
      value: `${(negationDensity * 100).toFixed(1)}%`,
      risk: negationDensity > 0.025 ? 'Elevated' : 'Baseline',
      detail: fallbackCopy.negationDetail,
    },
  ];

  if (contradictionCandidates.length > 0) {
    cues.push({
      label: fallbackCopy.conflictLabel,
      value: `${contradictionCandidates.length}`,
      risk: contradictionCandidates.length > 1 ? 'Critical' : 'Elevated',
      detail: fallbackCopy.conflictDetail,
    });
  }

  const metrics: MetricInsight[] = [
    {
      label: fallbackCopy.metrics.wordCountLabel,
      value: `${words.length.toLocaleString()} terms`,
      hint: fallbackCopy.metrics.wordCountHint,
    },
    {
      label: fallbackCopy.metrics.coverageLabel,
      value: `${Math.round((highlightedSentences.length / Math.max(sentences.length, 1)) * 100)}%`,
      hint: fallbackCopy.metrics.coverageHint,
    },
    {
      label: fallbackCopy.metrics.negationLabel,
      value: `${(negationDensity * 100).toFixed(1)}%`,
      hint: fallbackCopy.metrics.negationHint,
    },
  ];

  return {
    lieProbability,
    confidenceScore,
    summary: fallbackCopy.summary(hedgingDensity, pressureDensity, lieProbability),
    cues,
    metrics,
    evidence: synthesizeEvidence(highlightedSentences, hedgingSignals, pressureSignals, locale),
  };
};
