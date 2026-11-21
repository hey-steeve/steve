"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DictationSession {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface DictationConstructor {
  new (): DictationSession;
}

type DictationAvailability =
  | { readonly kind: "pending" }
  | { readonly kind: "ready" }
  | { readonly kind: "unavailable"; readonly notice: string };

const insecureNotice =
  "La dictée vocale a besoin d'une page en HTTPS ou en localhost.";
const unsupportedNotice =
  "La dictée vocale n'est pas disponible dans ce navigateur.";
const blockedNotice =
  "Le micro est indisponible. Autorisez-le, puis réessayez.";

const dictationNames = ["SpeechRecognition", "webkitSpeechRecognition"] as const;

function isDictationConstructor(value: unknown): value is DictationConstructor {
  return typeof value === "function";
}

function dictationConstructor(host: object): DictationConstructor | null {
  for (const name of dictationNames) {
    if (!(name in host)) {
      continue;
    }
    const value: unknown = Reflect.get(host, name);
    if (isDictationConstructor(value)) {
      return value;
    }
  }
  return null;
}

function dictationAvailability(input: {
  readonly secureContext: boolean;
  readonly constructor: DictationConstructor | null;
}): DictationAvailability {
  if (!input.secureContext) {
    return { kind: "unavailable", notice: insecureNotice };
  }
  if (input.constructor === null) {
    return { kind: "unavailable", notice: unsupportedNotice };
  }
  return { kind: "ready" };
}

function joinDictation(prefix: string, spoken: string): string {
  const trimmed = spoken.trim();
  if (trimmed.length === 0) {
    return prefix;
  }
  const base = prefix.trimEnd();
  if (base.length === 0) {
    return trimmed;
  }
  return `${base} ${trimmed}`;
}

function applyRecognition(input: {
  readonly prefix: string;
  readonly finals: string;
  readonly event: SpeechRecognitionEvent;
}): { readonly finals: string; readonly text: string } {
  let finals = input.finals;
  let interim = "";
  for (
    let index = input.event.resultIndex;
    index < input.event.results.length;
    index += 1
  ) {
    const result = input.event.results.item(index);
    if (result.length === 0) {
      continue;
    }
    const piece = result.item(0).transcript;
    if (result.isFinal) {
      finals += piece;
    } else {
      interim += piece;
    }
  }
  return { finals, text: joinDictation(input.prefix, `${finals}${interim}`) };
}

function frenchVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  let fallback: SpeechSynthesisVoice | null = null;
  for (const voice of voices) {
    const lang = voice.lang.toLowerCase();
    if (lang === "fr-fr") {
      return voice;
    }
    if (fallback === null && (lang === "fr" || lang.startsWith("fr-"))) {
      fallback = voice;
    }
  }
  return fallback;
}

export function useDictation(input: {
  readonly getDraft: () => string;
  readonly onTranscript: (text: string) => void;
}): {
  readonly listening: boolean;
  readonly notice: string | null;
  readonly supported: boolean;
  readonly toggle: () => void;
  readonly stop: () => void;
} {
  const inputRef = useRef(input);
  inputRef.current = input;
  const sessionRef = useRef<DictationSession | null>(null);
  const prefixRef = useRef("");
  const finalsRef = useRef("");
  const liveRef = useRef(false);
  const [availability, setAvailability] = useState<DictationAvailability>({
    kind: "pending",
  });
  const [listening, setListening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const next = dictationAvailability({
      secureContext: window.isSecureContext,
      constructor: dictationConstructor(window),
    });
    setAvailability(next);
  }, []);

  useEffect(() => {
    return () => {
      liveRef.current = false;
      sessionRef.current?.abort();
      sessionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    liveRef.current = false;
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (availability.kind !== "ready") {
      return;
    }
    if (liveRef.current) {
      stop();
      return;
    }
    const Ctor = dictationConstructor(window);
    if (Ctor === null) {
      setAvailability({ kind: "unavailable", notice: unsupportedNotice });
      return;
    }
    let session: DictationSession;
    try {
      session = new Ctor();
    } catch {
      setAvailability({ kind: "unavailable", notice: unsupportedNotice });
      return;
    }
    session.lang = "fr-FR";
    session.interimResults = true;
    session.continuous = true;
    prefixRef.current = inputRef.current.getDraft();
    finalsRef.current = "";
    liveRef.current = true;
    session.onresult = (event) => {
      if (!liveRef.current) {
        return;
      }
      const next = applyRecognition({
        prefix: prefixRef.current,
        finals: finalsRef.current,
        event,
      });
      finalsRef.current = next.finals;
      inputRef.current.onTranscript(next.text);
    };
    session.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") {
        return;
      }
      liveRef.current = false;
      setListening(false);
      setFailure(blockedNotice);
    };
    session.onend = () => {
      sessionRef.current = null;
      liveRef.current = false;
      setListening(false);
    };
    try {
      session.start();
    } catch {
      liveRef.current = false;
      setAvailability({ kind: "unavailable", notice: unsupportedNotice });
      return;
    }
    sessionRef.current = session;
    setListening(true);
    setFailure(null);
  }, [availability.kind, stop]);

  const notice =
    availability.kind === "unavailable" ? availability.notice : failure;

  return {
    listening,
    notice,
    supported: availability.kind === "ready",
    toggle,
    stop,
  };
}

export function readSpeechSynthesis(host: {
  readonly speechSynthesis?: object | null;
}): SpeechSynthesis | null {
  if (!("speechSynthesis" in host)) {
    return null;
  }
  const value: unknown = Reflect.get(host, "speechSynthesis");
  if (!isSpeechSynthesis(value)) {
    return null;
  }
  return value;
}

function isSpeechSynthesis(value: unknown): value is SpeechSynthesis {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    typeof Reflect.get(value, "cancel") === "function" &&
    typeof Reflect.get(value, "getVoices") === "function" &&
    typeof Reflect.get(value, "speak") === "function" &&
    typeof Reflect.get(value, "addEventListener") === "function" &&
    typeof Reflect.get(value, "removeEventListener") === "function"
  );
}

export function useSpeechPlayback(): {
  readonly activeId: string | null;
  readonly supported: boolean;
  readonly toggle: (id: string, text: string) => void;
  readonly stop: () => void;
} {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    const synth = readSpeechSynthesis(window);
    setSupported(synth !== null);
    if (synth === null) {
      return;
    }
    const warm = () => {
      synth.getVoices();
    };
    warm();
    synth.addEventListener("voiceschanged", warm);
    return () => {
      synth.removeEventListener("voiceschanged", warm);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    readSpeechSynthesis(window)?.cancel();
    activeRef.current = null;
    setActiveId(null);
  }, []);

  const toggle = useCallback((id: string, text: string) => {
    const synth = readSpeechSynthesis(window);
    if (synth === null) {
      return;
    }
    if (activeRef.current === id) {
      synth.cancel();
      activeRef.current = null;
      setActiveId(null);
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    const voice = frenchVoice(synth.getVoices());
    if (voice !== null) {
      utterance.voice = voice;
    }
    const finish = () => {
      if (activeRef.current !== id) {
        return;
      }
      activeRef.current = null;
      setActiveId(null);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    activeRef.current = id;
    setActiveId(id);
    synth.speak(utterance);
  }, []);

  return { activeId, supported, toggle, stop };
}
