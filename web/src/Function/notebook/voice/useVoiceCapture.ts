'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptSegment } from '../noteAiModel';

// Minimal structural types for the browser Web Speech API so TypeScript stays
// strict regardless of lib.dom version.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike | undefined;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceStatus = 'idle' | 'listening' | 'paused' | 'error';

/** Pure but for the browser. The language to listen in. The language the
 *  screen is shown in says little about the one a person speaks, so it is
 *  read from the browser's languages: the first that is not English when there
 *  is one (someone who lists another language beside English speaks it), else
 *  the first. Nothing to choose, so nothing to set wrong. */
export function spokenLanguage(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const langs = window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language];
  return langs.find((l) => l && !l.toLowerCase().startsWith('en')) ?? langs.find(Boolean) ?? fallback;
}

export interface VoiceCaptureState {
  supported: boolean;
  status: VoiceStatus;
  language: string;
  segments: TranscriptSegment[];
  interimText: string;
  elapsedSec: number;
  lastSpeechAt: number;
  error: string | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  clear: () => void;
  appendManualText: (text: string) => void;
}

export function useVoiceCapture(language: string): VoiceCaptureState {
  const [supported] = useState(() => getSpeechRecognitionCtor() !== null);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lastSpeechAt, setLastSpeechAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldKeepListeningRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartEngineRef = useRef<() => void>(() => {});
  const seqRef = useRef(0);

  const stopEngine = useCallback(() => {
    shouldKeepListeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // Ignore already-stopped errors
      }
    }
    setInterimText('');
  }, []);

  const startEngine = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setStatus('error');
      setError('unsupported');
      return;
    }

    // Tear down any previous instance cleanly.
    if (recognitionRef.current) {
      const old = recognitionRef.current;
      recognitionRef.current = null;
      old.onresult = null;
      old.onerror = null;
      old.onend = null;
      try {
        old.abort();
      } catch {
        // ignore
      }
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = language;

    rec.onresult = (event) => {
      let interim = '';
      const finals: TranscriptSegment[] = [];
      const now = Date.now();

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res?.[0]?.transcript?.trim() ?? '';
        if (!text) continue;
        if (res?.isFinal) {
          seqRef.current += 1;
          finals.push({ id: `seg-${now}-${seqRef.current}`, text, timestamp: now });
        } else {
          interim += (interim ? ' ' : '') + text;
        }
      }

      setInterimText(interim);
      if (finals.length > 0 || interim) {
        setLastSpeechAt(now);
      }
      if (finals.length > 0) {
        setSegments((prev) => [...prev, ...finals]);
      }
    };

    rec.onerror = (event) => {
      // 'no-speech' and 'aborted' are transient during continuous listening; let onend auto-restart.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldKeepListeningRef.current = false;
        setStatus('error');
        setError('permission-denied');
        return;
      }
      if (event.error === 'audio-capture') {
        shouldKeepListeningRef.current = false;
        setStatus('error');
        setError('no-microphone');
        return;
      }
      setError(event.error);
    };

    rec.onend = () => {
      setInterimText('');
      if (!shouldKeepListeningRef.current) return;
      // Browsers stop continuous recognition after ~60s of silence/audio;
      // restart seamlessly so long meetings never drop out.
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (shouldKeepListeningRef.current) restartEngineRef.current();
      }, 250);
    };

    recognitionRef.current = rec;
    shouldKeepListeningRef.current = true;
    setError(null);
    try {
      rec.start();
      setStatus('listening');
    } catch {
      setStatus('error');
      setError('start-failed');
    }
  }, [language]);

  const start = useCallback(() => {
    setError(null);
    startEngine();
  }, [startEngine]);

  const pause = useCallback(() => {
    stopEngine();
    setStatus('paused');
  }, [stopEngine]);

  const resume = useCallback(() => {
    setError(null);
    startEngine();
  }, [startEngine]);

  const stop = useCallback(() => {
    stopEngine();
    setStatus('idle');
  }, [stopEngine]);

  const clear = useCallback(() => {
    setSegments([]);
    setInterimText('');
    setElapsedSec(0);
    setLastSpeechAt(0);
    setError(null);
  }, []);

  const appendManualText = useCallback((raw: string) => {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const now = Date.now();
    const added: TranscriptSegment[] = lines.map((text) => {
      seqRef.current += 1;
      return { id: `seg-${now}-${seqRef.current}`, text, timestamp: now };
    });
    setSegments((prev) => [...prev, ...added]);
    setLastSpeechAt(now);
  }, []);

  // Elapsed timer ticks only while actively listening.
  useEffect(() => {
    if (status !== 'listening') return;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Keep restart handle pointed at the latest startEngine callback.
  useEffect(() => {
    restartEngineRef.current = startEngine;
  }, [startEngine]);

  // Clean up microphone stream on unmount / page switch.
  useEffect(() => () => stopEngine(), [stopEngine]);

  return {
    supported,
    status,
    language,
    segments,
    interimText,
    elapsedSec,
    lastSpeechAt,
    error,
    start,
    pause,
    resume,
    stop,
    clear,
    appendManualText,
  };
}
