'use client';

import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  analyzeTranscriptFallback,
  type AnalysisResult,
  type CueInsight,
  type CueRisk,
  type EvidenceInsight,
  type Locale,
  type MetricInsight,
} from '@/lib/analyzeFallback';

type StatusState =
  | { key: 'idle' }
  | { key: 'phase1' }
  | { key: 'phase3' }
  | { key: 'done' }
  | { key: 'fallback'; detail: string }
  | { key: 'failure'; detail: string };

type ErrorStateKey = 'noFile' | 'unsupportedFormat' | 'readError' | 'analysisUnknown' | 'noTokens';

interface ErrorState {
  key: ErrorStateKey;
  detail?: string;
}

const DEFAULT_LOCALE: Locale = 'ko';

interface TokenState {
  tokens: number;
  lastRefill: number;
  nextReadyInMs: number;
}

interface LocaleCopy {
  hero: {
    badgeLabel: string;
    organization: string;
    title: string;
    subtitle: string;
  };
  languageToggle: {
    label: string;
    options: Record<Locale, string>;
  };
  upload: {
    heading: string;
    formats: string;
    pdfPlaceholder: string;
    snapshot: string;
    typeLabel: string;
    intakeReady: string;
  };
  actions: {
    analyze: string;
    analyzing: string;
  };
  tokens: {
    label: string;
    subtitle: string;
    count: (value: number, max: number) => string;
    next: (minutes: number, seconds: number) => string;
    full: string;
    depleted: string;
  };
  status: {
    idle: string;
    phase1: string;
    phase3: string;
    done: string;
    fallback: (reason: string) => string;
    failure: (reason: string) => string;
  };
  errors: {
    noFile: string;
    unsupportedFormat: string;
    readError: string;
    analysisUnknown: (reason?: string) => string;
    noTokens: string;
  };
  pipeline: {
    title: string;
    version: string;
    stages: Array<{ label: string; detail: string }>;
  };
  modelStack: {
    title: string;
    primaryLabel: string;
    primaryValue: string;
    primaryDescription: string;
    secondaryLabel: string;
    secondaryValue: string;
    secondaryDescription: string;
  };
  analysisPanel: {
    badge: string;
    badgeStatus: string;
    title: string;
    sections: {
      cues: string;
      evidence: string;
      metrics: string;
    };
    emptyDescription: {
      intro: string;
      bullets: string[];
      outro: string;
    };
    confidenceLabel: (score: number) => string;
  };
  warning: {
    title: string;
    body: string;
  };
  logs: {
    title: string;
    intro: string;
  };
  realtime: {
    title: string;
    subtitle: string;
    status: string;
    riskLabel: string;
  };
}

interface LogItem {
  timestamp: string;
  code: string;
  summary: string;
  detail: string;
}

const allowedExtensions = ['.txt', '.json', '.csv', '.html', '.pdf'];

const TOKEN_MAX = 3;
const TOKEN_INTERVAL_MS = 30 * 60 * 1000;
const TOKEN_STORAGE_KEY = 'op6-token-state';
const LOCALE_STORAGE_KEY = 'op6-locale';

const reviveTokenState = (tokens: number, lastRefill: number): TokenState => {
  const now = Date.now();
  let normalizedTokens = Number.isFinite(tokens) ? Math.floor(tokens) : TOKEN_MAX;
  let normalizedLastRefill = Number.isFinite(lastRefill) ? lastRefill : now;

  if (normalizedTokens < 0) normalizedTokens = 0;
  if (normalizedTokens > TOKEN_MAX) normalizedTokens = TOKEN_MAX;

  if (normalizedTokens < TOKEN_MAX) {
    const elapsed = now - normalizedLastRefill;
    if (elapsed >= TOKEN_INTERVAL_MS) {
      const regained = Math.floor(elapsed / TOKEN_INTERVAL_MS);
      normalizedTokens = Math.min(TOKEN_MAX, normalizedTokens + regained);
      normalizedLastRefill =
        normalizedTokens === TOKEN_MAX
          ? now
          : normalizedLastRefill + regained * TOKEN_INTERVAL_MS;
    }
  }

  const nextReadyInMs =
    normalizedTokens >= TOKEN_MAX
      ? 0
      : Math.max(0, TOKEN_INTERVAL_MS - (now - normalizedLastRefill));

  return {
    tokens: normalizedTokens,
    lastRefill: normalizedLastRefill,
    nextReadyInMs,
  };
};

const translations: Record<Locale, LocaleCopy> = {
  ko: {
    hero: {
      badgeLabel: 'Signal Ops',
      organization: 'Veracity Intelligence Unit',
      title: '거짓말 분석기 - Linguistic Deception Profiler',
      subtitle:
        'OP-6 Veracity Oracle은 언어적 불일치, 압박 어휘, 시간적 모순을 복합적으로 스캔하여 대화 로그의 신뢰도를 산출합니다. GitHub Models GPT-4.1과 고정밀 규칙 기반 엔진을 결합해 수사 워크플로에 적합한 포렌식 리포트를 제공합니다.',
    },
    languageToggle: {
      label: 'LANGUAGE',
      options: {
        ko: '한국어',
        en: 'English',
      },
    },
    upload: {
      heading: '대화 로그 업로드',
      formats: '지원 포맷: txt, json, csv, html, pdf (2 MB 이하 권장)',
      pdfPlaceholder: 'PDF 프리뷰는 추출 후 제공됩니다. 분석을 실행해주세요.',
      snapshot: 'Snapshot',
      typeLabel: 'Type',
      intakeReady: 'Intake Ready',
    },
    actions: {
      analyze: '거짓말 위험도 분석 실행',
      analyzing: '포렌식 파이프라인 실행 중...',
    },
    tokens: {
      label: 'Access Tokens',
      subtitle: 'OP-6 실행 시 토큰 1개 소비, 30분마다 자동으로 1개 충전 (최대 3개)',
      count: (value, max) => `${value}/${max} 토큰`,
      next: (minutes, seconds) =>
        `다음 토큰 충전까지 ${String(minutes).padStart(2, '0')}분 ${String(seconds).padStart(2, '0')}초`,
      full: '모든 토큰이 준비되었습니다.',
      depleted: '토큰을 모두 사용했습니다. 충전 완료 후 다시 시도하세요.',
    },
    status: {
      idle: '대화 로그를 업로드하면 실시간 분석이 시작됩니다.',
      phase1: 'Phase 01: 인입 데이터 정규화 중...',
      phase3: 'Phase 03: GPT-4.1 결과 검증 및 시각화 중...',
      done: '분석 완료 - 결과 리포트를 확인하세요.',
      fallback: (reason) => `AI 분석 실패 - 휴리스틱 결과 제공 (${reason})`,
      failure: (reason) => `분석 실패: ${reason}`,
    },
    errors: {
      noFile: '먼저 대화 로그 파일을 업로드해주세요.',
      unsupportedFormat: '지원되는 형식은 .txt, .json, .csv, .html, .pdf 입니다.',
      readError: '파일을 읽어오는 중 오류가 발생했습니다. 다시 시도해주세요.',
      analysisUnknown: (reason) =>
        reason
          ? `분석 중 알 수 없는 오류가 발생했습니다: ${reason}`
          : '분석 중 알 수 없는 오류가 발생했습니다.',
      noTokens: '모든 토큰이 소진되었습니다. 충전 후 다시 시도해주세요.',
    },
    pipeline: {
      title: 'Pipeline Status',
      version: 'Rev. 2.1 Ops',
      stages: [
        {
          label: 'Phase 01 - Intake',
          detail: 'Checksum 검증, MIME 조정, 엔트로피 분석',
        },
        {
          label: 'Phase 02 - Feature Scan',
          detail: '헤징 분포, 압박 언어 주기, 부정어 클러스터',
        },
        {
          label: 'Phase 03 - LLM Fusion',
          detail: 'GitHub Models GPT-4.1, 포렌식 프롬프트 오케스트레이션',
        },
      ],
    },
    modelStack: {
      title: 'Model Stack',
      primaryLabel: '주 모델',
      primaryValue: 'GitHub Models - openai/gpt-4.1',
      primaryDescription: '거짓말 휴리스틱에 맞춰 튜닝된 포렌식 프롬프트로 JSON 응답을 강제합니다.',
      secondaryLabel: '교차 검증',
      secondaryValue: 'Rule-Based Linguistic Profiler',
      secondaryDescription: '헤징, 압박, 부정 스펙트럼을 활용해 AI 결과를 검증합니다.',
    },
    analysisPanel: {
      badge: 'Analysis Stack',
      badgeStatus: 'Classified',
      title: '결과 리포트',
      sections: {
        cues: 'Primary Signals',
        evidence: 'Source Evidence',
        metrics: 'Diagnostic Metrics',
      },
      emptyDescription: {
        intro:
          '업로드된 대화에서 언어적 불일치 패턴을 탐지하고, GitHub Models GPT-4.1 기반 엔진으로 거짓말 위험도를 계산합니다.',
        bullets: [
          '불확실성/회피 언어 스캔 및 수치화',
          '강압 언어와 부정 진술 클러스터링',
          'LLM 결과와 규칙 기반 교차 검증을 통한 확률 산출',
        ],
        outro: '샘플 로그를 업로드하면 3~5초 내에 첫 결과가 제공됩니다.',
      },
      confidenceLabel: (score) => `모델 신뢰도 ${score}% (composite)`,
    },
    warning: {
      title: 'CIA/FBI 합동 경고',
      body: 'OP-6 Veracity Oracle은 미국 연방 수사 기관 전용 도구입니다. 무단 사용 시 즉시 연방 대테러 감시 및 사법 조사가 개시되며 모든 세션은 감사 로그로 기록됩니다.',
    },
    logs: {
      title: '최신 운영 로그',
      intro: 'OP-6 엔지니어링 셀에서 전송된 최신 배포 상황입니다 (최신 -> 과거 순).',
    },
    realtime: {
      title: '실시간 분석 채널',
      subtitle: '다른 요원이 업로드한 세션이 암호화 채널을 통해 전파됩니다.',
      status: 'LIVE',
      riskLabel: '위험도',
    },
  },
  en: {
    hero: {
      badgeLabel: 'Signal Ops',
      organization: 'Veracity Intelligence Unit',
      title: 'Lie Analyzer - Linguistic Deception Profiler',
      subtitle:
        'OP-6 Veracity Oracle fuses linguistic heuristics with GitHub Models GPT-4.1 to profile deception risk across transcripts. It surfaces hedging, pressure language, and temporal drift to deliver investigator grade briefings.',
    },
    languageToggle: {
      label: 'LANGUAGE',
      options: {
        ko: 'Korean',
        en: 'English',
      },
    },
    upload: {
      heading: 'Upload Conversation Log',
      formats: 'Supported formats: txt, json, csv, html, pdf (recommended under 2 MB)',
      pdfPlaceholder: 'PDF preview appears after extraction. Run the analysis to continue.',
      snapshot: 'Snapshot',
      typeLabel: 'Type',
      intakeReady: 'Intake Ready',
    },
    actions: {
      analyze: 'Run Deception Risk Analysis',
      analyzing: 'Executing forensic pipeline...',
    },
    tokens: {
      label: 'Access Tokens',
      subtitle: 'Consumes 1 token per OP-6 execution. Recharges 1 token every 30 minutes (max 3).',
      count: (value, max) => `${value}/${max} tokens`,
      next: (minutes, seconds) =>
        `Next token in ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`,
      full: 'All tokens are ready.',
      depleted: 'All tokens spent. Stand by for the next recharge.',
    },
    status: {
      idle: 'Upload a conversation log to begin real-time analysis.',
      phase1: 'Phase 01: Normalizing intake payload...',
      phase3: 'Phase 03: Validating GPT-4.1 output and rendering visuals...',
      done: 'Analysis complete. Review the intelligence brief.',
      fallback: (reason) => `AI request failed - providing heuristic fallback (${reason})`,
      failure: (reason) => `Analysis failed: ${reason}`,
    },
    errors: {
      noFile: 'Please upload a conversation file first.',
      unsupportedFormat: 'Only .txt, .json, .csv, .html, and .pdf files are supported.',
      readError: 'Failed to read the file. Please try again.',
      analysisUnknown: (reason) =>
        reason ? `An unexpected error occurred during analysis: ${reason}` : 'An unexpected error occurred during analysis.',
      noTokens: 'All tokens are exhausted. Wait for a recharge before running another scan.',
    },
    pipeline: {
      title: 'Pipeline Status',
      version: 'Rev. 2.1 Ops',
      stages: [
        {
          label: 'Phase 01 - Intake',
          detail: 'Checksum validation, MIME reconciliation, entropy scan',
        },
        {
          label: 'Phase 02 - Feature Scan',
          detail: 'Hedging spectrum, pressure cadence, negation clusters',
        },
        {
          label: 'Phase 03 - LLM Fusion',
          detail: 'GitHub Models GPT-4.1, forensic prompt orchestration',
        },
      ],
    },
    modelStack: {
      title: 'Model Stack',
      primaryLabel: 'Primary Model',
      primaryValue: 'GitHub Models - openai/gpt-4.1',
      primaryDescription: 'Forensic prompt tuned for deception heuristics with enforced JSON responses.',
      secondaryLabel: 'Cross Check',
      secondaryValue: 'Rule-Based Linguistic Profiler',
      secondaryDescription: 'Validates AI output using hedging, pressure, and negation spectra.',
    },
    analysisPanel: {
      badge: 'Analysis Stack',
      badgeStatus: 'Classified',
      title: 'Intelligence Brief',
      sections: {
        cues: 'Primary Signals',
        evidence: 'Source Evidence',
        metrics: 'Diagnostic Metrics',
      },
      emptyDescription: {
        intro:
          'Detect linguistic inconsistencies and compute deception risk using GitHub Models GPT-4.1.',
        bullets: [
          'Quantifies hedging and evasive language',
          'Clusters pressure wording and denial bursts',
          'Cross-validates LLM output with rule-based heuristics',
        ],
        outro: 'Upload a sample log to receive the first report in under five seconds.',
      },
      confidenceLabel: (score) => `Model confidence ${score}% (composite)`,
    },
    warning: {
      title: 'CIA/FBI Joint Warning',
      body: 'OP-6 Veracity Oracle is restricted to federal counter-intelligence use. Unauthorized access triggers full federal investigation protocols and comprehensive session logging.',
    },
    logs: {
      title: 'Operational Dev Log',
      intro: 'Live dispatches from the OP-6 engineering cell (newest first).',
    },
    realtime: {
      title: 'Live Analyst Feed',
      subtitle: 'Encrypted traffic from peer operators is relayed in real time.',
      status: 'LIVE',
      riskLabel: 'Risk',
    },
  },
};

const developmentLogs: Record<Locale, LogItem[]> = {
  ko: [
    {
      timestamp: '2025-03-27 09:42 Z',
      code: 'SIG-294',
      summary: '다국어 LLM 검증 파이프라인에 역위험 필터 추가 완료',
      detail: '시간 정보가 충돌하는 문장을 자동으로 재점수하여 허위 진술 가능성을 가중 적용합니다.',
    },
    {
      timestamp: '2025-03-26 22:10 Z',
      code: 'OPS-188',
      summary: '토큰 스케줄러 퍼시스턴스 패치',
      detail: '브라우저 재시작 후에도 충전 카운트가 유지되도록 드리프트 내성 타임스탬프 체계를 도입했습니다.',
    },
    {
      timestamp: '2025-03-25 14:55 Z',
      code: 'JTF-502',
      summary: 'FBI 공조 감사 규약 준수 확인',
      detail: '사건 보고서 내보내기 시 자동 비식별 처리 매크로를 적용하도록 워크플로를 동기화했습니다.',
    },
    {
      timestamp: '2025-03-24 08:18 Z',
      code: 'LAB-207',
      summary: '휴리스틱 엔진 헤징 사전 확장',
      detail: '비밀 감청 코퍼스에서 추가된 38개의 회피 표현을 탐지 목록에 반영했습니다.',
    },
  ],
  en: [
    {
      timestamp: '2025-03-27 09:42 Z',
      code: 'SIG-294',
      summary: 'Inverse-risk filter deployed for multi-lingual GPT validation',
      detail: 'Automatically re-scores conflicting timestamp narratives to amplify deception likelihood.',
    },
    {
      timestamp: '2025-03-26 22:10 Z',
      code: 'OPS-188',
      summary: 'Token scheduler persistence patch',
      detail: 'Introduced drift-tolerant timestamps so recharge timers survive browser restarts.',
    },
    {
      timestamp: '2025-03-25 14:55 Z',
      code: 'JTF-502',
      summary: 'Joint task force audit alignment',
      detail: 'Synced export workflow with FBI-approved redaction macros for casework artifacts.',
    },
    {
      timestamp: '2025-03-24 08:18 Z',
      code: 'LAB-207',
      summary: 'Heuristic engine hedging lexicon expanded',
      detail: 'Integrated 38 covert intercept phrases into the evasive-language detection list.',
    },
  ],
};

const realtimeAgents: Record<Locale, string[]> = {
  ko: ['AGT-KILO7', 'STRIKE-11', 'BRAVO-4', 'NOVA-8', 'SIGMA-21', 'ECHO-5'],
  en: ['AGT-KILO7', 'STRIKE-11', 'BRAVO-4', 'NOVA-8', 'SIGMA-21', 'ECHO-5'],
};

const realtimeTargets: Record<Locale, string[]> = {
  ko: ['대상 ARROW-3', '피조사자 DELTA-9', '용의자 SABLE-2', '정보원 ORION-6', '시민 보고자 VERTEX', '에이전트 GHOST-5'],
  en: ['Target ARROW-3', 'Subject DELTA-9', 'Asset SABLE-2', 'Informant ORION-6', 'Witness VERTEX', 'Agent GHOST-5'],
};

const realtimeChannels = ['SEC-21', 'SIG-88', 'OPS-44', 'ARC-09', 'JTF-33', 'GHOST-70'];
const REALTIME_FEED_LIMIT = 24;

const realtimeTags: Record<Locale, string[]> = {
  ko: ['[ALERT]', '[SYNC]', '[TRACE]', '[VECTOR]'],
  en: ['[ALERT]', '[SYNC]', '[TRACE]', '[VECTOR]'],
};

type TemplatePayload = {
  target: string;
  channel: string;
  risk: number;
};

const realtimeTemplates: Record<Locale, Array<(payload: TemplatePayload) => string>> = {
  ko: [
    ({ target, channel, risk }) => `${target} → 위험도 ${risk}% 상승 (채널 ${channel})`,
    ({ target, channel, risk }) => `${channel} 재분석 완료 · ${target} 점수 ${risk}%`,
    ({ target, risk }) => `${target} 발화 패턴에서 경보 레벨 ${risk}% 감지`,
    ({ target, channel, risk }) => `${target} / ${channel} 라우팅 → 신뢰도 ${100 - risk}%`,
  ],
  en: [
    ({ target, channel, risk }) => `${target} risk spike ${risk}% via ${channel}`,
    ({ target, channel, risk }) => `${channel} replay mapped ${target} at ${risk}% suspicion`,
    ({ target, risk }) => `${target} speech markers elevated to ${risk}%`,
    ({ target, channel, risk }) => `${target} routed on ${channel} · confidence ${100 - risk}%`,
  ],
};

const randomOf = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

const createRealtimeEvent = (locale: Locale, offsetMs = 0): RealtimeEvent => {
  const agent = randomOf(realtimeAgents[locale]);
  const target = randomOf(realtimeTargets[locale]);
  const channel = randomOf(realtimeChannels);
  const risk = Math.max(8, Math.min(97, Math.round(30 + Math.random() * 55)));
  const template = randomOf(realtimeTemplates[locale]);
  const tag = randomOf(realtimeTags[locale]);
  const timestampDate = new Date(Date.now() - offsetMs);
  const timestamp = timestampDate.toLocaleTimeString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    hour12: false,
  });

  return {
    id: `${timestampDate.getTime()}-${Math.random().toString(16).slice(2, 7)}`,
    agent,
    message: `${tag} ${template({ target, channel, risk })}`,
    channel,
    risk,
    timestamp,
  };
};

const seedRealtimeFeed = (locale: Locale, count = 6): RealtimeEvent[] =>
  Array.from({ length: Math.min(count, REALTIME_FEED_LIMIT) }, (_, index) =>
    createRealtimeEvent(locale, index * 45000),
  );

const formatBytes = (size: number) => {
  if (!Number.isFinite(size)) return 'Unknown size';
  if (size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / Math.pow(1024, exponent);
  return `${value.toFixed(1)} ${units[exponent]}`;
};

const getExtension = (fileName: string) => {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index).toLowerCase();
};

const getStatusText = (status: StatusState, copy: LocaleCopy) => {
  switch (status.key) {
    case 'idle':
      return copy.status.idle;
    case 'phase1':
      return copy.status.phase1;
    case 'phase3':
      return copy.status.phase3;
    case 'done':
      return copy.status.done;
    case 'fallback':
      return copy.status.fallback(status.detail);
    case 'failure':
      return copy.status.failure(status.detail);
    default:
      return copy.status.idle;
  }
};

const getErrorText = (error: ErrorState | null, copy: LocaleCopy) => {
  if (!error) return null;
  switch (error.key) {
    case 'noFile':
      return copy.errors.noFile;
    case 'unsupportedFormat':
      return copy.errors.unsupportedFormat;
    case 'readError':
      return copy.errors.readError;
    case 'analysisUnknown':
      return copy.errors.analysisUnknown(error.detail);
    case 'noTokens':
      return copy.errors.noTokens;
    default:
      return null;
  }
};

type PreviewState =
  | { kind: 'none' }
  | { kind: 'text'; content: string }
  | { kind: 'pdf-placeholder' };

export default function Home() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [clientPreview, setClientPreview] = useState<PreviewState>({ kind: 'none' });
  const [serverPreview, setServerPreview] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisSource, setAnalysisSource] = useState<'api' | 'fallback' | null>(null);
  const [realtimeFeed, setRealtimeFeed] = useState<RealtimeEvent[]>(() =>
    seedRealtimeFeed(DEFAULT_LOCALE),
  );
  const [status, setStatus] = useState<StatusState>({ key: 'idle' });
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tokenState, setTokenState] = useState<TokenState>(() => {
    if (typeof window === 'undefined') {
      return {
        tokens: TOKEN_MAX,
        lastRefill: Date.now(),
        nextReadyInMs: 0,
      };
    }
    try {
      const saved = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { tokens?: number; lastRefill?: number };
        return reviveTokenState(parsed.tokens ?? TOKEN_MAX, parsed.lastRefill ?? Date.now());
      }
    } catch (error) {
      console.warn('Failed to read token state', error);
    }
    return {
      tokens: TOKEN_MAX,
      lastRefill: Date.now(),
      nextReadyInMs: 0,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'ko' || saved === 'en') {
      setLocale(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    setRealtimeFeed(seedRealtimeFeed(locale));
  }, [locale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timeoutId: number;

    const scheduleNext = () => {
      const delay = 4500 + Math.random() * 5000;
      timeoutId = window.setTimeout(() => {
        setRealtimeFeed((current) => {
          const nextEvent = createRealtimeEvent(locale);
          const updated = [nextEvent, ...current];
          return updated.slice(0, REALTIME_FEED_LIMIT);
        });
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => window.clearTimeout(timeoutId);
  }, [locale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => {
      setTokenState((current) => {
        const updated = reviveTokenState(current.tokens, current.lastRefill);
        if (
          updated.tokens === current.tokens &&
          updated.lastRefill === current.lastRefill &&
          updated.nextReadyInMs === current.nextReadyInMs
        ) {
          return current;
        }
        return updated;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({ tokens: tokenState.tokens, lastRefill: tokenState.lastRefill }),
    );
  }, [tokenState.tokens, tokenState.lastRefill]);

  useEffect(() => {
    if (analysisSource === 'fallback' && fileContent.trim()) {
      setAnalysis(analyzeTranscriptFallback(fileContent, locale));
    }
  }, [analysisSource, fileContent, locale]);

  useEffect(() => {
    if (!isAnalyzing) {
      setProgress((current) => (current === 100 ? current : 0));
      return;
    }
    const interval = window.setInterval(() => {
      setProgress((current) => Math.min(92, current + Math.random() * 8));
    }, 420);
    return () => window.clearInterval(interval);
  }, [isAnalyzing]);

  const copy = translations[locale];
  const logs = developmentLogs[locale];

  const displayPreview = useMemo(() => {
    if (serverPreview) return serverPreview;
    if (clientPreview.kind === 'text') return clientPreview.content;
    if (clientPreview.kind === 'pdf-placeholder') return copy.upload.pdfPlaceholder;
    return '';
  }, [clientPreview, copy.upload.pdfPlaceholder, serverPreview]);

  const statusText = useMemo(() => getStatusText(status, copy), [status, copy]);
  const errorMessage = useMemo(() => getErrorText(errorState, copy), [errorState, copy]);

  const extension = useMemo(
    () => (selectedFile ? getExtension(selectedFile.name) : ''),
    [selectedFile],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAnalysis(null);
    setAnalysisSource(null);
    setServerPreview('');
    setStatus({ key: 'idle' });
    setErrorState(null);

    if (!file) {
      setSelectedFile(null);
      setFileContent('');
      setClientPreview({ kind: 'none' });
      return;
    }

    const ext = getExtension(file.name);
    if (!allowedExtensions.includes(ext)) {
      setErrorState({ key: 'unsupportedFormat' });
      setSelectedFile(null);
      setFileContent('');
      setClientPreview({ kind: 'none' });
      return;
    }

    setSelectedFile(file);
    setFileContent('');
    setClientPreview({ kind: 'none' });

    if (ext === '.pdf') {
      setClientPreview({ kind: 'pdf-placeholder' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const normalized = text.replace(/\s+/g, ' ');
      setFileContent(text);
      setClientPreview({
        kind: 'text',
        content: normalized.length > 480 ? `${normalized.slice(0, 480)}...` : normalized,
      });
    };
    reader.onerror = () => {
      setErrorState({ key: 'readError' });
      setFileContent('');
      setClientPreview({ kind: 'none' });
      setSelectedFile(null);
    };
    reader.readAsText(file, 'utf-8');
  };

  const consumeToken = () => {
    setTokenState((current) => {
      if (current.tokens <= 0) return current;
      return reviveTokenState(current.tokens - 1, Date.now());
    });
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setErrorState({ key: 'noFile' });
      return;
    }

    if (tokenState.tokens <= 0) {
      setErrorState({ key: 'noTokens' });
      return;
    }

    setErrorState(null);
    setIsAnalyzing(true);
    setStatus({ key: 'phase1' });
    setProgress(6);
    consumeToken();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('locale', locale);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      const sourceFromApi: 'api' | 'fallback' =
        data.source === 'heuristic' ? 'fallback' : 'api';
      const fallbackReason =
        typeof data.reason === 'string' && data.reason.trim().length > 0
          ? data.reason
          : locale === 'ko'
          ? 'LLM JSON 파싱 실패'
          : 'LLM JSON parsing failure';

      setStatus({ key: 'phase3' });
      setAnalysis(data.analysis as AnalysisResult);
      setAnalysisSource(sourceFromApi);
      setServerPreview(data.preview as string);
      setProgress(100);
      window.setTimeout(() => {
        setIsAnalyzing(false);
        if (sourceFromApi === 'fallback') {
          setStatus({ key: 'fallback', detail: fallbackReason });
        } else {
          setStatus({ key: 'done' });
        }
      }, 360);
    } catch (err) {
      const message = err instanceof Error ? err.message : copy.errors.analysisUnknown();

      if (fileContent.trim()) {
        setAnalysis(analyzeTranscriptFallback(fileContent, locale));
        setAnalysisSource('fallback');
        setProgress(100);
        setStatus({ key: 'fallback', detail: message });
      } else {
        setErrorState({ key: 'analysisUnknown', detail: message });
        setAnalysis(null);
        setAnalysisSource(null);
        setProgress(0);
        setStatus({ key: 'failure', detail: message });
      }

      setIsAnalyzing(false);
    }
  };

  const minutesUntilToken = Math.max(0, Math.floor(tokenState.nextReadyInMs / 60000));
  const secondsUntilToken = Math.max(0, Math.floor((tokenState.nextReadyInMs % 60000) / 1000));
  const tokenInfo =
    tokenState.tokens === 0
      ? copy.tokens.depleted
      : tokenState.tokens >= TOKEN_MAX
      ? copy.tokens.full
      : copy.tokens.next(minutesUntilToken, secondsUntilToken);

  const tokenProgress =
    tokenState.tokens >= TOKEN_MAX
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            ((TOKEN_INTERVAL_MS - tokenState.nextReadyInMs) / TOKEN_INTERVAL_MS) * 100,
          ),
        );

  const localeOptions: Locale[] = ['ko', 'en'];

  return (
    <div className="min-h-screen bg-[#01030A] text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-cyan-400/80">
              <span className="rounded-full border border-cyan-500/40 px-3 py-1">
                {copy.hero.badgeLabel}
              </span>
              <span>{copy.hero.organization}</span>
            </div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
              <span>{copy.languageToggle.label}</span>
              <div className="flex overflow-hidden rounded-full border border-cyan-500/40 bg-slate-900/40">
                {localeOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLocale(option)}
                    className={`px-3 py-1 text-xs font-semibold transition ${
                      locale === option
                        ? 'bg-cyan-400 text-slate-900'
                        : 'text-slate-300 hover:bg-cyan-500/10'
                    }`}
                  >
                    {copy.languageToggle.options[option]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-white sm:text-5xl">{copy.hero.title}</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-400 sm:text-base">
            {copy.hero.subtitle}
          </p>
        </header>

        <section className="grid gap-8 xl:grid-cols-[1.7fr,1.1fr,0.9fr]">
          <div className="flex flex-col gap-6">
            <div className="space-y-6 rounded-3xl border border-cyan-500/20 bg-slate-950/50 p-8 shadow-[0_0_40px_rgba(0,255,255,0.08)]">
              <div>
                <label
                  htmlFor="transcript-upload"
                  className="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-cyan-500/40 bg-slate-900/60 p-10 text-center transition hover:border-cyan-300/70 hover:bg-slate-900/80"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
                    <span className="text-sm font-semibold">UPLOAD</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-medium text-white">{copy.upload.heading}</p>
                    <p className="text-xs text-slate-400">{copy.upload.formats}</p>
                  </div>
                </label>
                <input
                  id="transcript-upload"
                  name="transcript-upload"
                  type="file"
                  accept={allowedExtensions.join(',')}
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </div>

              {selectedFile && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(selectedFile.size)} · {new Date(selectedFile.lastModified).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                      {copy.upload.intakeReady}
                    </span>
                  </div>
                  {displayPreview && (
                    <div className="mt-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                        {copy.upload.snapshot}
                      </p>
                      <pre className="mt-2 max-h-36 overflow-hidden whitespace-pre-wrap rounded-xl bg-slate-950/70 p-4 text-sm text-slate-300">
                        {displayPreview}
                      </pre>
                    </div>
                  )}
                  {extension && (
                    <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      {copy.upload.typeLabel}: {extension.replace('.', '').toUpperCase()}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !selectedFile || tokenState.tokens <= 0}
                  className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-8 py-3 text-sm font-semibold text-slate-900 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAnalyzing ? copy.actions.analyzing : copy.actions.analyze}
                </button>
                <p className="text-xs text-slate-500">
                  GitHub Models GPT-4.1 · Rule-based cross validation · Secure local execution
                </p>
              </div>

              {errorMessage && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/60 p-8">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-400/80">{copy.tokens.label}</p>
                <span className="text-xs font-semibold text-cyan-200">
                  {copy.tokens.count(tokenState.tokens, TOKEN_MAX)}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{copy.tokens.subtitle}</p>
              <p
                className={`mt-4 text-xs ${
                  tokenState.tokens === 0 ? 'text-red-300' : 'text-cyan-200'
                }`}
              >
                {tokenInfo}
              </p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-300 transition-all"
                  style={{ width: `${tokenProgress}%` }}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-500/10 bg-gradient-to-br from-slate-950 via-[#040b18] to-[#01030a] p-8">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-400/70">{copy.pipeline.title}</p>
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {copy.pipeline.version}
                </span>
              </div>
              <p className="mt-4 text-sm text-slate-300">{statusText}</p>
              <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-300 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {copy.pipeline.stages.map((stage) => (
                  <div key={stage.label} className="rounded-2xl border border-cyan-500/10 bg-slate-950/60 p-4">
                    <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">{stage.label}</p>
                    <p className="mt-2 text-xs text-slate-400">{stage.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/50 p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-400/70">{copy.modelStack.title}</p>
              <div className="mt-4 grid gap-4 text-sm text-slate-300 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">{copy.modelStack.primaryLabel}</p>
                  <p className="font-medium text-white">{copy.modelStack.primaryValue}</p>
                  <p className="text-xs text-slate-500">{copy.modelStack.primaryDescription}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">{copy.modelStack.secondaryLabel}</p>
                  <p className="font-medium text-white">{copy.modelStack.secondaryValue}</p>
                  <p className="text-xs text-slate-500">{copy.modelStack.secondaryDescription}</p>
                </div>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-6 rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-[#020611] p-8">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.4em] text-cyan-400/70">{copy.analysisPanel.badge}</p>
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {copy.analysisPanel.badgeStatus}
              </span>
            </div>
            <h2 className="text-2xl font-semibold text-white">{copy.analysisPanel.title}</h2>
            {analysis ? (
              <div className="space-y-6">
                <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-6 text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Deception Likelihood</p>
                  <p className="mt-4 text-5xl font-bold text-white">
                    {analysis.lieProbability}
                    <span className="ml-1 text-2xl text-cyan-200">%</span>
                  </p>
                  <p className="mt-2 text-xs text-cyan-100/80">
                    {copy.analysisPanel.confidenceLabel(analysis.confidenceScore)}
                  </p>
                </div>

                <p className="text-sm leading-relaxed text-slate-300">{analysis.summary}</p>

                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    {copy.analysisPanel.sections.cues}
                  </h3>
                  <div className="space-y-3">
                    {analysis.cues.map((cue) => (
                      <div key={cue.label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-200">{cue.label}</p>
                            <p className="text-xs text-slate-500">{cue.detail}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-cyan-200">{cue.value}</p>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{cue.risk}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {analysis.evidence.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      {copy.analysisPanel.sections.evidence}
                    </h3>
                    <div className="space-y-2">
                      {analysis.evidence.map((item, index) => (
                        <blockquote
                          key={`${item.quote}-${index}`}
                          className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300"
                        >
                          <p className="font-semibold text-slate-200">&quot;{item.quote}&quot;</p>
                          <p className="mt-2 text-[11px] text-slate-500">{item.rationale}</p>
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    {copy.analysisPanel.sections.metrics}
                  </h3>
                  <dl className="grid grid-cols-1 gap-3 text-xs text-slate-400">
                    {analysis.metrics.map((metric) => (
                      <div key={metric.label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                        <dt className="text-sm font-semibold text-slate-200">{metric.label}</dt>
                        <dd className="mt-1 text-cyan-100">{metric.value}</dd>
                        <p className="mt-2 text-[11px] text-slate-500">{metric.hint}</p>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm text-slate-400">
                <p>{copy.analysisPanel.emptyDescription.intro}</p>
                <ul className="space-y-2 text-xs text-slate-500">
                  {copy.analysisPanel.emptyDescription.bullets.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
                <p className="text-xs text-slate-600">{copy.analysisPanel.emptyDescription.outro}</p>
              </div>
            )}
          </aside>

          <aside className="flex flex-col gap-6">
            <div className="rounded-3xl border border-red-500/40 bg-gradient-to-br from-[#260404] via-[#120202] to-[#040101] p-8">
              <p className="text-xs uppercase tracking-[0.35em] text-red-300">{copy.warning.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-red-200/80">{copy.warning.body}</p>
            </div>
            <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/60 p-8">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-400/80">{copy.logs.title}</p>
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Ops Live</span>
              </div>
              <p className="mt-3 text-xs text-slate-500">{copy.logs.intro}</p>
              <div className="mt-6 space-y-4">
                {logs.map((entry) => (
                  <div key={`${entry.timestamp}-${entry.code}`} className="rounded-2xl border border-cyan-500/10 bg-slate-950/70 p-4">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      <span>{entry.timestamp}</span>
                      <span className="text-cyan-300">{entry.code}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-200">{entry.summary}</p>
                    <p className="mt-1 text-xs text-slate-400">{entry.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/60 p-8">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-400/80">{copy.realtime.title}</p>
                <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-300 animate-pulse">
                  {copy.realtime.status}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">{copy.realtime.subtitle}</p>
              <div className="mt-5 h-80 overflow-hidden rounded-2xl border border-cyan-500/10 bg-slate-950/40">
                <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 pr-2 text-xs text-slate-300">
                  {realtimeFeed.map((event) => {
                    const riskTone =
                      event.risk >= 75
                        ? 'text-red-300'
                        : event.risk >= 45
                        ? 'text-amber-300'
                        : 'text-emerald-300';
                    return (
                      <div key={event.id} className="rounded-xl border border-cyan-500/10 bg-slate-900/60 p-3">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-slate-500">
                          <span>{event.timestamp}</span>
                          <span className="text-cyan-300">{event.channel}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-200">{event.agent}</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-400">{event.message}</p>
                        <p className={`mt-2 text-[11px] font-semibold ${riskTone}`}>
                          {copy.realtime.riskLabel} {event.risk}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
