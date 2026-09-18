"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HIRAGANA, KATAKANA, type KanaEntry } from "@/app/lib/kana";

type Mode = "hiragana" | "katakana" | "mixed";
type Result = "correct" | "wrong";

type HistoryItem = {
  key: number;
  char: string;
  romaji: string;
  result: Result | "skip";
};

type SideItem = {
  key: number;
  char: string;
  result?: Result;
};

const POOLS: Record<Mode, KanaEntry[]> = {
  hiragana: HIRAGANA,
  katakana: KATAKANA,
  mixed: [...HIRAGANA, ...KATAKANA],
};

const MODES: Mode[] = ["hiragana", "katakana", "mixed"];
const REVEAL_DELAY_MS = 500;
const MIN_CHARS_BEFORE_WRONG = 2;
const IDLE_PAUSE_MS = 10000;

function pickRandom(pool: KanaEntry[], excludeChar?: string): KanaEntry {
  if (pool.length <= 1) return pool[0];
  let entry: KanaEntry;
  do {
    entry = pool[Math.floor(Math.random() * pool.length)];
  } while (entry.char === excludeChar);
  return entry;
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// True once no valid answer can still start with this input.
function isDead(input: string, answers: string[]) {
  return !answers.some((a) => a.startsWith(input));
}

// True once input exactly matches an answer that no longer answer extends.
function isSettled(input: string, answers: string[]) {
  if (!answers.includes(input)) return false;
  return !answers.some((a) => a !== input && a.length > input.length && a.startsWith(input));
}

let keySeq = 0;
const nextKey = () => keySeq++;

export default function HiraganaQuiz() {
  const [mode, setMode] = useState<Mode>("hiragana");
  const [skipAnimation, setSkipAnimation] = useState(false);

  const [current, setCurrent] = useState<KanaEntry | null>(null);
  const [next, setNext] = useState<KanaEntry | null>(null);
  const [prevItem, setPrevItem] = useState<SideItem | null>(null);

  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [paused, setPaused] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [seenCount, setSeenCount] = useState(0);
  const [totalCorrectChars, setTotalCorrectChars] = useState(0);
  const [totalAnswerMs, setTotalAnswerMs] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startTimeRef = useRef(Date.now());
  const itemStartRef = useRef(Date.now());
  const lastActivityRef = useRef(Date.now());
  const pauseStartRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetSession = useCallback((m: Mode) => {
    const pool = POOLS[m];
    const first = pickRandom(pool);
    const second = pickRandom(pool, first.char);
    setCurrent(first);
    setNext(second);
    setPrevItem(null);
    setInput("");
    setRevealed(false);
    setPaused(false);
    setHistory([]);
    setCorrectCount(0);
    setStreak(0);
    setSeenCount(0);
    setTotalCorrectChars(0);
    setTotalAnswerMs(0);
    setAnsweredCount(0);
    startTimeRef.current = Date.now();
    itemStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    pauseStartRef.current = null;
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    resetSession(mode);
  }, [mode, resetSession]);

  const resume = useCallback(() => {
    if (pauseStartRef.current !== null) {
      const idleDuration = Date.now() - pauseStartRef.current;
      startTimeRef.current += idleDuration;
      itemStartRef.current += idleDuration;
      pauseStartRef.current = null;
    }
    lastActivityRef.current = Date.now();
    setPaused(false);
  }, []);

  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (paused) resume();
  }, [paused, resume]);

  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_PAUSE_MS) {
        setPaused((wasPaused) => {
          if (!wasPaused) pauseStartRef.current = Date.now();
          return true;
        });
        return;
      }
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [current]);

  const advance = useCallback(
    (result: Result | "skip") => {
      if (!current || !next) return;
      setSeenCount((c) => c + 1);

      const elapsed = Date.now() - itemStartRef.current;

      setHistory((prev) =>
        [
          ...prev,
          { key: nextKey(), char: current.char, romaji: current.answers[0], result },
        ].slice(-10)
      );

      if (result !== "skip") {
        setAnsweredCount((c) => c + 1);
        setTotalAnswerMs((t) => t + elapsed);
        if (result === "correct") {
          setCorrectCount((c) => c + 1);
          setStreak((s) => s + 1);
          setTotalCorrectChars((c) => c + current.answers[0].length);
        } else {
          setStreak(0);
        }
        setPrevItem({ key: nextKey(), char: current.char, result });
      } else {
        setPrevItem({ key: nextKey(), char: current.char });
      }

      setCurrent(next);
      setNext(pickRandom(POOLS[mode], next.char));
      setInput("");
      setRevealed(false);
      itemStartRef.current = Date.now();
    },
    [current, next, mode]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    registerActivity();
    if (revealed || !current) return;
    const raw = e.target.value.toLowerCase().replace(/[^a-z]/g, "");
    setInput(raw);
    if (!raw) return;

    if (isSettled(raw, current.answers)) {
      advance("correct");
    } else if (raw.length >= MIN_CHARS_BEFORE_WRONG && isDead(raw, current.answers)) {
      advance("wrong");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    registerActivity();
    if (revealed || !current) return;

    if (e.key === "Enter") {
      e.preventDefault();
      if (!input.trim()) {
        advance("skip");
      } else {
        const isCorrect = current.answers.includes(input);
        advance(isCorrect ? "correct" : "wrong");
      }
    } else if (e.key === " ") {
      e.preventDefault();
      advance("skip");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setRevealed(true);
      setInput(current.answers[0]);
      setTimeout(() => advance("wrong"), REVEAL_DELAY_MS);
    }
  }

  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 100;
  const avgTimeSec = answeredCount > 0 ? totalAnswerMs / answeredCount / 1000 : 0;
  const minutes = elapsedSeconds / 60;
  const wpm = minutes > 0 ? Math.round(totalCorrectChars / 5 / minutes) : 0;

  const cardRing = revealed ? "border-amber-500/60" : "border-zinc-800";

  return (
    <div
      className="flex min-h-screen w-full flex-col bg-black font-mono text-zinc-50"
      onClick={() => inputRef.current?.focus()}
    >
      <header className="grid grid-cols-3 items-start px-8 py-6">
        <div className="text-sm text-zinc-300">
          kana<span className="text-zinc-600">.</span>drill
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex justify-center gap-2">
            {MODES.map((m) => (
              <button
                key={m}
                onClick={(e) => {
                  e.stopPropagation();
                  if (m !== mode) setMode(m);
                }}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  m === mode
                    ? "border-green-800/60 bg-green-950/30 text-green-400"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <label
            className="flex items-center gap-1.5 text-xs text-zinc-500 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={skipAnimation}
              onChange={(e) => setSkipAnimation(e.target.checked)}
              className="accent-green-500"
            />
            disable animation
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 text-sm text-zinc-400">
          <span>{formatTime(elapsedSeconds)}</span>
          <button
            aria-label="Reset session"
            title="Reset session"
            onClick={(e) => {
              e.stopPropagation();
              resetSession(mode);
            }}
            className="text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4">
        {current && next && (
          <>
            <div className="flex items-center justify-center gap-14 sm:gap-24">
              <div className="flex h-20 w-20 items-center justify-center">
                {prevItem && (
                  <div
                    key={prevItem.key}
                    className={`flex h-16 w-16 -rotate-12 items-center justify-center rounded-xl border text-4xl text-zinc-500 ${
                      skipAnimation ? "" : "animate-kana-settle"
                    } ${
                      prevItem.result === "correct"
                        ? "border-green-500/60"
                        : prevItem.result === "wrong"
                          ? "border-red-500/60"
                          : "border-transparent"
                    }`}
                  >
                    {prevItem.char}
                  </div>
                )}
              </div>

              <div
                className={`flex h-56 w-56 items-center justify-center overflow-hidden rounded-3xl border bg-zinc-950 shadow-lg transition-colors duration-200 sm:h-72 sm:w-72 ${cardRing}`}
              >
                <span
                  key={`${current.char}-${seenCount}`}
                  className={`text-7xl font-medium select-none sm:text-8xl ${
                    skipAnimation ? "" : "animate-kana-grow-shrink"
                  }`}
                >
                  {current.char}
                </span>
              </div>

              <div className="flex h-20 w-20 items-center justify-center">
                <div
                  key={`${next.char}-${seenCount}`}
                  className={`flex h-16 w-16 rotate-12 items-center justify-center rounded-xl text-4xl text-zinc-600 opacity-50 ${
                    skipAnimation ? "" : "animate-kana-pop"
                  }`}
                >
                  {next.char}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="relative flex items-center justify-center border-b border-zinc-800 pb-2">
                <div className="flex min-h-9 min-w-[3ch] items-center text-2xl">
                  <span className={revealed ? "text-amber-400" : "text-white"}>{input}</span>
                  {!revealed &&
                    (paused ? (
                      <button
                        aria-label="Resume"
                        title="Resume"
                        onClick={(e) => {
                          e.stopPropagation();
                          resume();
                          inputRef.current?.focus();
                        }}
                        className="ml-1 flex h-6 w-6 items-center justify-center rounded-sm text-sm text-zinc-300 hover:text-white"
                      >
                        ⏸
                      </button>
                    ) : (
                      <span className="ml-0.5 h-6 w-2.5 animate-blink bg-white" />
                    ))}
                </div>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  disabled={revealed}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Romaji input"
                  className="absolute inset-0 h-full w-full cursor-default opacity-0"
                />
              </div>

              <p
                className={`text-[11px] text-zinc-600 transition-opacity ${paused ? "opacity-100" : "opacity-0"}`}
              >
                statistics paused
              </p>

              <Link
                href="/beginner"
                onClick={(e) => e.stopPropagation()}
                className="rounded-md border border-zinc-800 px-3 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
              >
                Beginner?
              </Link>
            </div>
          </>
        )}
      </main>

      <div className="grid grid-cols-5 divide-x divide-zinc-900 border-t border-zinc-900 py-6">
        <Stat value={wpm} label="wpm" />
        <Stat value={`${accuracy}%`} label="accuracy" />
        <Stat value={streak} label="streak" />
        <Stat value={seenCount} label="seen" />
        <Stat value={`${avgTimeSec.toFixed(1)}s`} label="avg time" />
      </div>

      <div className="flex items-center gap-3 overflow-x-auto px-16 py-4">
        <span className="shrink-0 text-xs text-zinc-600">recent</span>
        {history.map((h) => (
          <div
            key={h.key}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
              h.result === "correct"
                ? "border-green-900/60 bg-green-950/40 text-green-400"
                : h.result === "wrong"
                  ? "border-red-900/60 bg-red-950/40 text-red-400"
                  : "border-white/50 bg-white/5 text-zinc-200"
            }`}
          >
            <span>{h.char}</span>
            <span className="opacity-70">{h.romaji}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-3xl font-semibold text-zinc-50">{value}</span>
      <span className="text-[10px] tracking-widest text-zinc-600 uppercase">{label}</span>
    </div>
  );
}
