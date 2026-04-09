"use client";

/**
 * VoiceTextarea
 *
 * A drop-in replacement for <Textarea> that adds a "Dictate" mic button
 * inline with the label. Transcribed speech is APPENDED to whatever text
 * is already in the field, so the manager can type and dictate freely.
 *
 * Usage:
 *   <VoiceTextarea
 *     label="Manager Notes"
 *     value={notes}
 *     onChange={(e) => setNotes(e.target.value)}
 *     onTranscript={(text) => setNotes((prev) => [prev, text].filter(Boolean).join(" "))}
 *     placeholder="…"
 *   />
 *
 * If the browser does not support the Web Speech API the Dictate button is
 * silently omitted — the field works exactly like a plain <Textarea>.
 */

import { forwardRef } from "react";
import Textarea from "@/src/components/ui/Textarea";
import type { TextareaProps } from "@/src/components/ui/Textarea";
import SpeechToTextButton from "@/src/components/ui/SpeechToTextButton";

export interface VoiceTextareaProps extends TextareaProps {
  /**
   * Receives each finalised speech segment.
   * Typically: (text) => setValue(prev => [prev, text].filter(Boolean).join(" "))
   */
  onTranscript: (text: string) => void;
  /** BCP-47 language for speech recognition. Defaults to browser language. */
  speechLang?: string;
}

const VoiceTextarea = forwardRef<HTMLTextAreaElement, VoiceTextareaProps>(
  ({ label, onTranscript, speechLang, disabled, ...textareaProps }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {/* Label row — label on the left, mic button on the right */}
        {label && (
          <div className="flex items-center justify-between gap-2">
            <span className="body-sm font-medium text-[var(--color-text)]">
              {label}
            </span>
            <SpeechToTextButton
              onTranscript={onTranscript}
              disabled={disabled}
              lang={speechLang}
            />
          </div>
        )}

        {/*
          Pass label=undefined so Textarea does not render a duplicate label.
          All other props (value, onChange, placeholder, rows, error, etc.) pass through.
        */}
        <Textarea
          ref={ref}
          label={undefined}
          disabled={disabled}
          {...textareaProps}
        />
      </div>
    );
  }
);

VoiceTextarea.displayName = "VoiceTextarea";
export default VoiceTextarea;
