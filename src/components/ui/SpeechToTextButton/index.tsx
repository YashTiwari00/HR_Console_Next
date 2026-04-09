"use client";

/**
 * SpeechToTextButton
 *
 * Uses the browser-native Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * No external cost, no server round-trip.
 *
 * Behaviour:
 *  - First click  → starts recording; button turns red and pulses
 *  - Second click → stops recording; final transcript is passed to onTranscript()
 *  - Interim text (in-progress words) is shown as a live preview below the button
 *  - Auto-stops after ~3 s of silence (browser default for continuous=false is one utterance;
 *    we use continuous=true so the manager can dictate freely and click Stop when done)
 *  - On error (mic denied, no speech, etc.) → clear human-readable message for 4 s
 *  - Renders null when the API is not available (non-Chrome browsers in unsupported mode)
 */

import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionState = "idle" | "recording" | "error";

export interface SpeechToTextButtonProps {
  /** Called once per final recognised segment. Append or replace text as needed. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
  /** BCP-47 language tag. Defaults to the browser's UI language. */
  lang?: string;
}

// ── Minimal Web Speech API typings ────────────────────────────────────────────
// These are not included in the default tsconfig lib for this project,
// so we declare them locally rather than adding a dep or touching tsconfig.

interface SpeechRecognitionResultItem {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => ISpeechRecognition;

// Extend Window to include both standard and webkit-prefixed APIs
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export default function SpeechToTextButton({
  onTranscript,
  disabled = false,
  lang,
}: SpeechToTextButtonProps) {
  const [state, setState] = useState<RecognitionState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [interimText, setInterimText] = useState("");
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const pendingRef = useRef(""); // accumulates finals between onresult firings

  // Detect support on mount (client-only)
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState("idle");
    setInterimText("");
  }, []);

  const startRecognition = useCallback(() => {
    const SR: SpeechRecognitionConstructor | undefined =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SR) return;

    const recognition: ISpeechRecognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    if (lang) recognition.lang = lang;

    pendingRef.current = "";

    recognition.onstart = () => {
      setState("recording");
      setErrorMsg("");
      setInterimText("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          pendingRef.current += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimText(interim);

      // Flush finalised text to the parent as each sentence completes
      if (pendingRef.current) {
        onTranscript(pendingRef.current.trim());
        pendingRef.current = "";
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const messages: Record<string, string> = {
        "not-allowed": "Microphone access denied — allow it in browser settings.",
        "no-speech": "No speech detected. Try again.",
        "network": "Network error during recognition.",
        "audio-capture": "No microphone found.",
        "service-not-allowed": "Speech service not available.",
      };
      setErrorMsg(messages[event.error] ?? `Recognition error: ${event.error}`);
      setState("error");
      recognitionRef.current = null;
      setTimeout(() => {
        setState("idle");
        setErrorMsg("");
      }, 4000);
    };

    recognition.onend = () => {
      // Flush any remaining pending text
      if (pendingRef.current) {
        onTranscript(pendingRef.current.trim());
        pendingRef.current = "";
      }
      // Only reset to idle if we didn't already set an error state
      setState((prev) => (prev === "recording" ? "idle" : prev));
      setInterimText("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [lang, onTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const handleClick = useCallback(() => {
    if (state === "recording") {
      stopRecognition();
    } else if (state === "idle") {
      startRecognition();
    }
  }, [state, startRecognition, stopRecognition]);

  if (!supported) return null;

  const isRecording = state === "recording";
  const isError = state === "error";

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isError}
        aria-label={isRecording ? "Stop voice recording" : "Start voice recording"}
        title={isRecording ? "Click to stop recording" : "Click to dictate (Web Speech API)"}
        className={[
          "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1",
          "body-sm font-medium border transition-all duration-150 select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isRecording
            ? "border-red-400 bg-red-50 text-red-600 animate-pulse"
            : isError
              ? "border-[var(--color-danger)] bg-[var(--color-danger)] text-white"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]",
        ].join(" ")}
      >
        {isRecording ? (
          <>
            {/* Stop square */}
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="1" y="1" width="8" height="8" rx="1.5" />
            </svg>
            <span>Stop</span>
          </>
        ) : (
          <>
            {/* Microphone */}
            <svg
              width="11"
              height="14"
              viewBox="0 0 11 14"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="3"
                y="0.5"
                width="5"
                height="7"
                rx="2.5"
                fill="currentColor"
              />
              <path
                d="M1 6.5a4.5 4.5 0 009 0"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                fill="none"
              />
              <line
                x1="5.5"
                y1="11"
                x2="5.5"
                y2="13"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <line
                x1="3"
                y1="13"
                x2="8"
                y2="13"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <span>Dictate</span>
          </>
        )}
      </button>

      {/* Live interim preview */}
      {isRecording && interimText && (
        <span
          className="caption italic text-[var(--color-text-muted)] max-w-[220px] text-right leading-tight"
          aria-live="polite"
          aria-label="Interim transcription"
        >
          {interimText}…
        </span>
      )}

      {/* Error message */}
      {isError && errorMsg && (
        <span
          className="caption text-[var(--color-danger)] max-w-[220px] text-right leading-tight"
          role="alert"
        >
          {errorMsg}
        </span>
      )}
    </span>
  );
}
