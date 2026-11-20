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
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
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

/** 'starting' is asked to listen and not yet hearing: the browser is still
 *  waiting for the microphone (its permission, or the device itself). */
export type VoiceStatus = 'idle' | 'starting' | 'listening' | 'paused' | 'error';

/** How long listening may take to begin before the person is told it has not. */
const START_WAIT_MS = 6000;

/** How long listening may go on with no words before the person is told why. */
const SILENCE_WAIT_MS = 10000;

/** Why no words have come: nothing reaches the microphone, or sound does and
 *  the browser's speech service gives nothing back for it. */
export type VoiceSilence = 'no-audio' | 'no-sound' | 'no-words';

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
  /** Listening, and no words yet: what the browser has and has not heard. */
  silence: VoiceSilence | null;
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
  const interimRef = useRef('');
  const startWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [silence, setSilence] = useState<VoiceSilence | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the browser has reported since listening began.
  const heardRef = useRef({ audio: false, sound: false, words: false });
  // Counts each request to listen, so one that is overtaken does not start late.
  const askRef = useRef(0);

  // Words still unsettled when listening ends (a pause, a stop, the browser's
  // own restart every minute or so) never come back settled: they are kept
  // as they stand, not dropped.
  const settleInterim = useCallback(() => {
    const text = interimRef.current.trim();
    interimRef.current = '';
    setInterimText('');
    if (!text) return;
    const now = Date.now();
    seqRef.current += 1;
    const id = `seg-${now}-${seqRef.current}`;
    setSegments((prev) => [...prev, { id, text, timestamp: now }]);
    setLastSpeechAt(now);
  }, []);

  const stopEngine = useCallback(() => {
    shouldKeepListeningRef.current = false;
    askRef.current += 1;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (startWaitRef.current) {
      clearTimeout(startWaitRef.current);
      startWaitRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setSilence(null);
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      rec.onaudiostart = null;
      rec.onsoundstart = null;
      try {
        rec.stop();
      } catch {
        // Ignore already-stopped errors
      }
    }
    settleInterim();
  }, [settleInterim]);

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
      old.onstart = null;
      old.onaudiostart = null;
      old.onsoundstart = null;
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

    // Listening has begun only when the browser says so: until then it may be
    // waiting on a permission prompt nobody has answered, with no error at all.
    rec.onstart = () => {
      if (startWaitRef.current) {
        clearTimeout(startWaitRef.current);
        startWaitRef.current = null;
      }
      setError(null);
      setStatus('listening');
      // Listening that brings no words says nothing by itself: after a
      // while the person is told how far the sound got.
      if (!heardRef.current.words && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          const heard = heardRef.current;
          if (!heard.words) setSilence(!heard.audio ? 'no-audio' : !heard.sound ? 'no-sound' : 'no-words');
        }, SILENCE_WAIT_MS);
      }
    };
    rec.onaudiostart = () => { heardRef.current.audio = true; };
    rec.onsoundstart = () => { heardRef.current.sound = true; };

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

      if (finals.length > 0 || interim) {
        heardRef.current.words = true;
        setSilence(null);
      }
      interimRef.current = interim;
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
      settleInterim();
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
    try {
      rec.start();
    } catch {
      setStatus('error');
      setError('start-failed');
      return;
    }
    if (startWaitRef.current) clearTimeout(startWaitRef.current);
    startWaitRef.current = setTimeout(() => {
      startWaitRef.current = null;
      if (recognitionRef.current !== rec) return;
      // Still waiting: said so, with Record there to try again. If the
      // browser begins after all, listening takes over from here.
      setError('not-started');
      setStatus((now) => (now === 'starting' ? 'error' : now));
    }, START_WAIT_MS);
  }, [language, settleInterim]);

  // The microphone is asked for outright first: that brings up the browser's
  // prompt where it can be seen, and says plainly when it is refused or there
  // is none, which listening alone leaves unsaid.
  const start = useCallback(() => {
    setError(null);
    setStatus('starting');
    heardRef.current = { audio: false, sound: false, words: false };
    const ask = (askRef.current += 1);
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      startEngine();
      return;
    }
    media.getUserMedia({ audio: true }).then(
      (stream) => {
        stream.getTracks().forEach((track) => track.stop());
        if (askRef.current === ask) startEngine();
      },
      (err: unknown) => {
        if (askRef.current !== ask) return;
        const name = err instanceof Error ? err.name : '';
        setStatus('error');
        setError(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no-microphone' : name === 'NotAllowedError' || name === 'SecurityError' ? 'permission-denied' : 'start-failed');
      },
    );
  }, [startEngine]);

  const pause = useCallback(() => {
    stopEngine();
    setStatus('paused');
  }, [stopEngine]);

  const resume = start;

  const stop = useCallback(() => {
    stopEngine();
    setStatus('idle');
  }, [stopEngine]);

  const clear = useCallback(() => {
    setSegments([]);
    interimRef.current = '';
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
    silence,
    start,
    pause,
    resume,
    stop,
    clear,
    appendManualText,
  };
}
