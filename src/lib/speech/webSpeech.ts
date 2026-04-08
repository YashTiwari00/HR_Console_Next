type PermissionStateResult = PermissionState | 'unsupported' | 'unknown';

export type SpeechToTextErrorCode =
  | 'unsupported-browser'
  | 'permission-denied'
  | 'permission-blocked'
  | 'audio-capture-failed'
  | 'no-speech'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface SpeechToTextError {
  code: SpeechToTextErrorCode;
  message: string;
  nativeError?: string;
}

export interface SpeechToTextResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
}

export interface SpeechToTextOptions {
  lang?: string;
  interimResults?: boolean;
  continuous?: boolean;
  maxAlternatives?: number;
}

export interface SpeechToTextCallbacks {
  onStateChange?: (listening: boolean) => void;
  onInterimResult?: (result: SpeechToTextResult) => void;
  onFinalResult?: (result: SpeechToTextResult) => void;
  onError?: (error: SpeechToTextError) => void;
}

export interface SpeechToTextController {
  start: () => Promise<void>;
  stop: () => void;
  abort: () => void;
  dispose: () => void;
  setOptions: (nextOptions: Partial<SpeechToTextOptions>) => void;
  isSupported: () => boolean;
  getPermissionState: () => Promise<PermissionStateResult>;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionLike, ev: Event) => unknown) | null;
  onend: ((this: SpeechRecognitionLike, ev: Event) => unknown) | null;
  onerror: ((this: SpeechRecognitionLike, ev: SpeechRecognitionErrorEventLike) => unknown) | null;
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => unknown) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const DEFAULT_OPTIONS: Required<SpeechToTextOptions> = {
  lang: 'en-US',
  interimResults: true,
  continuous: true,
  maxAlternatives: 1,
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function mapRecognitionError(errorCode: string): SpeechToTextErrorCode {
  const value = String(errorCode || '').trim().toLowerCase();
  if (value === 'not-allowed') return 'permission-denied';
  if (value === 'service-not-allowed') return 'permission-blocked';
  if (value === 'audio-capture') return 'audio-capture-failed';
  if (value === 'no-speech') return 'no-speech';
  if (value === 'network') return 'network';
  if (value === 'aborted') return 'aborted';
  return 'unknown';
}

function buildErrorMessage(code: SpeechToTextErrorCode, fallback?: string) {
  if (fallback && String(fallback).trim()) {
    return String(fallback).trim();
  }

  if (code === 'unsupported-browser') {
    return 'Speech input is not supported in this browser.';
  }

  if (code === 'permission-denied' || code === 'permission-blocked') {
    return 'Microphone permission is blocked. You can continue typing normally.';
  }

  if (code === 'audio-capture-failed') {
    return 'Microphone is unavailable. You can continue typing normally.';
  }

  if (code === 'no-speech') {
    return 'No speech detected. Try again or continue typing.';
  }

  if (code === 'network') {
    return 'Speech service connection issue. You can continue typing normally.';
  }

  if (code === 'aborted') {
    return 'Recording stopped.';
  }

  return 'Speech recognition is unavailable right now. You can continue typing normally.';
}

function normalizeOptions(input?: SpeechToTextOptions): Required<SpeechToTextOptions> {
  return {
    lang: input?.lang || DEFAULT_OPTIONS.lang,
    interimResults: typeof input?.interimResults === 'boolean' ? input.interimResults : DEFAULT_OPTIONS.interimResults,
    continuous: typeof input?.continuous === 'boolean' ? input.continuous : DEFAULT_OPTIONS.continuous,
    maxAlternatives:
      typeof input?.maxAlternatives === 'number' && Number.isFinite(input.maxAlternatives)
        ? Math.max(1, Math.floor(input.maxAlternatives))
        : DEFAULT_OPTIONS.maxAlternatives,
  };
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(getRecognitionConstructor());
}

export async function getMicrophonePermissionState(): Promise<PermissionStateResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unsupported';
  }

  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return 'unknown';
  }

  try {
    const result = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    return result.state;
  } catch {
    return 'unknown';
  }
}

export function createSpeechToTextController(
  options?: SpeechToTextOptions,
  callbacks?: SpeechToTextCallbacks
): SpeechToTextController {
  let recognition: SpeechRecognitionLike | null = null;
  let listening = false;
  let starting = false;
  let disposed = false;
  let resolvedOptions = normalizeOptions(options);

  function emitState(nextState: boolean) {
    if (listening === nextState) return;
    listening = nextState;
    callbacks?.onStateChange?.(nextState);
  }

  function applyOptions(target: SpeechRecognitionLike) {
    target.lang = resolvedOptions.lang;
    target.interimResults = resolvedOptions.interimResults;
    target.continuous = resolvedOptions.continuous;
    target.maxAlternatives = resolvedOptions.maxAlternatives;
  }

  function ensureRecognitionInstance(): SpeechRecognitionLike | null {
    if (disposed) return null;
    if (recognition) return recognition;

    const Constructor = getRecognitionConstructor();
    if (!Constructor) {
      return null;
    }

    const instance = new Constructor();
    applyOptions(instance);

    instance.onstart = () => {
      starting = false;
      emitState(true);
    };

    instance.onend = () => {
      starting = false;
      emitState(false);
    };

    instance.onerror = (event) => {
      starting = false;
      emitState(false);
      const code = mapRecognitionError(event.error);
      callbacks?.onError?.({
        code,
        message: buildErrorMessage(code, event.message),
        nativeError: event.error,
      });
    };

    instance.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      let confidence = 0;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result || result.length === 0) continue;

        const alternative = result[0];
        const transcript = String(alternative?.transcript || '').trim();
        if (!transcript) continue;

        const nextConfidence = Number(alternative?.confidence || 0);
        if (Number.isFinite(nextConfidence) && nextConfidence > confidence) {
          confidence = nextConfidence;
        }

        if (result.isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interimTranscript += `${transcript} `;
        }
      }

      const cleanInterim = interimTranscript.trim();
      if (cleanInterim) {
        callbacks?.onInterimResult?.({
          transcript: cleanInterim,
          isFinal: false,
          confidence,
        });
      }

      const cleanFinal = finalTranscript.trim();
      if (cleanFinal) {
        callbacks?.onFinalResult?.({
          transcript: cleanFinal,
          isFinal: true,
          confidence,
        });
      }
    };

    recognition = instance;
    return recognition;
  }

  return {
    async start() {
      if (disposed || listening || starting) {
        return;
      }

      starting = true;

      try {
        const Constructor = getRecognitionConstructor();
        if (!Constructor) {
          callbacks?.onError?.({
            code: 'unsupported-browser',
            message: buildErrorMessage('unsupported-browser'),
          });
          return;
        }

        const permissionState = await getMicrophonePermissionState();
        if (permissionState === 'denied') {
          callbacks?.onError?.({
            code: 'permission-denied',
            message: buildErrorMessage('permission-denied'),
          });
          return;
        }

        const instance = ensureRecognitionInstance();
        if (!instance) {
          callbacks?.onError?.({
            code: 'unsupported-browser',
            message: buildErrorMessage('unsupported-browser'),
          });
          return;
        }

        applyOptions(instance);

        instance.start();
      } catch {
        callbacks?.onError?.({
          code: 'unknown',
          message: buildErrorMessage('unknown'),
        });
      } finally {
        if (!listening) {
          starting = false;
        }
      }
    },

    stop() {
      if (!recognition || disposed || !listening) return;
      try {
        recognition.stop();
      } catch {
        callbacks?.onError?.({
          code: 'unknown',
          message: buildErrorMessage('unknown'),
        });
      }
    },

    abort() {
      if (!recognition || disposed) return;
      try {
        recognition.abort();
      } catch {
        callbacks?.onError?.({
          code: 'aborted',
          message: buildErrorMessage('aborted'),
        });
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      starting = false;

      if (recognition) {
        recognition.onstart = null;
        recognition.onend = null;
        recognition.onerror = null;
        recognition.onresult = null;

        try {
          recognition.abort();
        } catch {
          // Ignore abort failures during cleanup.
        }

        recognition = null;
      }

      emitState(false);
    },

    setOptions(nextOptions) {
      resolvedOptions = {
        lang: nextOptions?.lang || resolvedOptions.lang,
        interimResults:
          typeof nextOptions?.interimResults === 'boolean'
            ? nextOptions.interimResults
            : resolvedOptions.interimResults,
        continuous:
          typeof nextOptions?.continuous === 'boolean'
            ? nextOptions.continuous
            : resolvedOptions.continuous,
        maxAlternatives:
          typeof nextOptions?.maxAlternatives === 'number' && Number.isFinite(nextOptions.maxAlternatives)
            ? Math.max(1, Math.floor(nextOptions.maxAlternatives))
            : resolvedOptions.maxAlternatives,
      };

      if (recognition) {
        applyOptions(recognition);
      }
    },

    isSupported() {
      return Boolean(getRecognitionConstructor());
    },

    async getPermissionState() {
      return getMicrophonePermissionState();
    },
  };
}
