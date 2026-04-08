'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../Button';
import { cn } from '@/src/lib/cn';
import {
  createSpeechToTextController,
  type SpeechToTextController,
  type SpeechToTextError,
} from '@/src/lib/speech';

export interface SpeechToTextButtonProps {
  onFinalTranscript: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
  onError?: (error: SpeechToTextError) => void;
  disabled?: boolean;
  ariaLabel?: string;
  lang?: string;
  autoStopAfterSilenceMs?: number;
  className?: string;
}

export default function SpeechToTextButton({
  onFinalTranscript,
  onInterimTranscript,
  onError,
  disabled = false,
  ariaLabel = 'Toggle speech to text',
  lang = 'en-US',
  autoStopAfterSilenceMs = 0,
  className,
}: SpeechToTextButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const controllerRef = useRef<SpeechToTextController | null>(null);
  const finalHandlerRef = useRef(onFinalTranscript);
  const interimHandlerRef = useRef(onInterimTranscript);
  const errorHandlerRef = useRef(onError);
  const lastInterimRef = useRef('');
  const hasFinalInSessionRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningRef = useRef(false);

  const clearSilenceTimer = useCallback(() => {
    if (!silenceTimerRef.current) return;
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }, []);

  const scheduleSilenceAutoStop = useCallback(() => {
    if (autoStopAfterSilenceMs <= 0 || !controllerRef.current || !listeningRef.current) {
      return;
    }

    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (!controllerRef.current || !listeningRef.current) return;
      controllerRef.current.stop();
      setErrorMessage((prev) => (prev ? prev : 'Stopped after silence. You can continue typing.'));
    }, autoStopAfterSilenceMs);
  }, [autoStopAfterSilenceMs, clearSilenceTimer]);

  useEffect(() => {
    finalHandlerRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    interimHandlerRef.current = onInterimTranscript;
  }, [onInterimTranscript]);

  useEffect(() => {
    errorHandlerRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const controller = createSpeechToTextController(
      { lang, interimResults: true, continuous: true, maxAlternatives: 1 },
      {
        onStateChange: (listening) => {
          listeningRef.current = listening;

          if (listening) {
            hasFinalInSessionRef.current = false;
            lastInterimRef.current = '';
            scheduleSilenceAutoStop();
          } else {
            clearSilenceTimer();
          }

          if (!listening && !hasFinalInSessionRef.current) {
            const partial = lastInterimRef.current.trim();
            if (partial) {
              finalHandlerRef.current(partial);
            }
          }

          setIsListening((prev) => (prev === listening ? prev : listening));
          setIsProcessing(false);
        },
        onInterimResult: (result) => {
          lastInterimRef.current = result.transcript || '';
          scheduleSilenceAutoStop();
          interimHandlerRef.current?.(result.transcript);
        },
        onFinalResult: (result) => {
          hasFinalInSessionRef.current = true;
          lastInterimRef.current = '';
          scheduleSilenceAutoStop();
          finalHandlerRef.current(result.transcript);
        },
        onError: (error) => {
          if (!hasFinalInSessionRef.current) {
            const partial = lastInterimRef.current.trim();
            if (partial) {
              finalHandlerRef.current(partial);
              lastInterimRef.current = '';
            }
          }

          clearSilenceTimer();
          setIsProcessing(false);
          setErrorMessage((prev) => {
            const next = error.message || 'Speech recognition failed.';
            return prev === next ? prev : next;
          });
          errorHandlerRef.current?.(error);
        },
      }
    );

    controllerRef.current = controller;
    setIsSupported((prev) => {
      const next = controller.isSupported();
      return prev === next ? prev : next;
    });

    return () => {
      clearSilenceTimer();
      controller.dispose();
      controllerRef.current = null;
      listeningRef.current = false;
    };
  }, [lang, clearSilenceTimer, scheduleSilenceAutoStop]);

  async function toggleListening() {
    if (!controllerRef.current || disabled || !isSupported || isProcessing) {
      return;
    }

    setErrorMessage((prev) => (prev ? '' : prev));
    setIsProcessing(true);

    if (isListening) {
      controllerRef.current.stop();
      return;
    }

    await controllerRef.current.start();
  }

  const resolvedLabel = isListening ? 'Stop recording' : 'Start recording';
  const finalAriaLabel = `${ariaLabel}. ${resolvedLabel}`;
  const unsupportedText = 'Speech recognition is not supported in this browser.';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        size="sm"
        variant={isListening ? 'danger' : 'ghost'}
        onClick={toggleListening}
        disabled={disabled || !isSupported || isProcessing}
        aria-pressed={isListening}
        aria-label={finalAriaLabel}
        title={!isSupported ? unsupportedText : errorMessage || resolvedLabel}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm0 0v4m-5-8a5 5 0 1 0 10 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="sr-only">{resolvedLabel}</span>
      </Button>

      {isListening ? (
        <span className="caption text-[var(--color-danger)]" aria-live="polite">
          Recording...
        </span>
      ) : null}
      {!isListening && isProcessing ? (
        <span className="caption text-[var(--color-text-muted)]" aria-live="polite">
          Processing...
        </span>
      ) : null}
      {!isSupported ? (
        <span className="caption" aria-live="polite">Mic unavailable</span>
      ) : null}
      {isSupported && !isListening && errorMessage ? (
        <span className="caption text-[var(--color-text-muted)]" aria-live="polite">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
