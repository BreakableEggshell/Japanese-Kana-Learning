"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HIRAGANA, KATAKANA, GOJUON_ROWS, type KanaEntry } from "@/app/lib/kana";
import { isDead, isSettled, MIN_CHARS_BEFORE_WRONG, nameTextClass, playSound, formatDuration } from "@/app/lib/kana-input";
import { supabase, LEADERBOARD_SIZE, type LeaderboardEntry } from "@/app/lib/supabase";
import { useResizablePanel } from "@/app/lib/use-resizable-panel";

type Mode = "hiragana" | "katakana" | "mixed";
type Script = "hiragana" | "katakana";
type Result = "correct" | "wrong";
type Mastery = "mastered" | "learning" | "needs-work" | "not-started";

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

type CharStat = {
  correctStreak: number;
  wrongCount: number;
  attempts: number;
};

const POOLS: Record<Mode, KanaEntry[]> = {
  hiragana: HIRAGANA,
  katakana: KATAKANA,
  mixed: [...HIRAGANA, ...KATAKANA],
};

const MODES: Mode[] = ["hiragana", "katakana", "mixed"];
const REVEAL_DELAY_MS = 500;
const IDLE_PAUSE_MS = 30000;
const LEADERBOARD_REFRESH_MS = 30000;
const WRONG_STREAK_THRESHOLD = 8;
const PRACTICE_GLOW_MS = 5000;

const MASTERY_LEGEND: { key: Mastery; label: string; dot: string }[] = [
  { key: "mastered", label: "mastered", dot: "bg-green-500" },
  { key: "learning", label: "learning", dot: "bg-violet-400" },
  { key: "needs-work", label: "needs work", dot: "bg-red-400" },
  { key: "not-started", label: "not started", dot: "bg-zinc-600" },
];

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

function getMastery(stat: CharStat | undefined): Mastery {
  if (!stat || stat.attempts === 0) return "not-started";
  if (stat.correctStreak >= 3) return "mastered";
  if (stat.wrongCount >= 2 && stat.correctStreak === 0) return "needs-work";
  return "learning";
}

function masteryClasses(m: Mastery) {
  switch (m) {
    case "mastered":
      return "border-green-800/60 bg-green-950/40 text-green-400";
    case "learning":
      return "border-violet-800/60 bg-violet-950/40 text-violet-300";
    case "needs-work":
      return "border-red-800/60 bg-red-950/40 text-red-400";
    default:
      return "border-zinc-800 bg-zinc-900/40 text-zinc-600";
  }
}

let keySeq = 0;
const nextKey = () => keySeq++;

export default function KanaQuiz() {
  const [mode, setMode] = useState<Mode>("hiragana");
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [muted, setMuted] = useState(false);

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
  const [avgAnswerCount, setAvgAnswerCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [charStats, setCharStats] = useState<Record<string, CharStat>>({});

  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsScript, setStatsScript] = useState<Script>("hiragana");
  const [optionsOpen, setOptionsOpen] = useState(false);

  const [practiceStruggling, setPracticeStruggling] = useState(false);
  const [practiceGlow, setPracticeGlow] = useState(false);

  const startTimeRef = useRef(Date.now());
  const itemStartRef = useRef(Date.now());
  const lastActivityRef = useRef(Date.now());
  const pauseStartRef = useRef<number | null>(null);
  const itemWasIdleRef = useRef(false);
  const wrongStreakRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const statsWidth = useResizablePanel(480);
  const leaderboardWidth = useResizablePanel(480);

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
    setAvgAnswerCount(0);
    setAnsweredCount(0);
    startTimeRef.current = Date.now();
    itemStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    pauseStartRef.current = null;
    itemWasIdleRef.current = false;
    wrongStreakRef.current = 0;
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
          if (!wasPaused) {
            pauseStartRef.current = Date.now();
            itemWasIdleRef.current = true;
          }
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
        // If the player went AFK on this item, its time was inflated by the
        // idle wait — exclude it from the average-time stat entirely.
        if (!itemWasIdleRef.current) {
          setTotalAnswerMs((t) => t + elapsed);
          setAvgAnswerCount((c) => c + 1);
        }
        if (result === "correct") {
          setCorrectCount((c) => c + 1);
          setStreak((s) => s + 1);
          setTotalCorrectChars((c) => c + current.answers[0].length);
          playSound("/correct.mp3", muted);
          wrongStreakRef.current = 0;
        } else {
          setStreak(0);
          playSound("/wrong.mp3", muted);
          wrongStreakRef.current += 1;
          if (wrongStreakRef.current >= WRONG_STREAK_THRESHOLD) {
            wrongStreakRef.current = 0;
            setPracticeStruggling(true);
            setPracticeGlow(true);
            setTimeout(() => setPracticeGlow(false), PRACTICE_GLOW_MS);
          }
        }
        setPrevItem({ key: nextKey(), char: current.char, result });

        setCharStats((prev) => {
          const s = prev[current.char] ?? { correctStreak: 0, wrongCount: 0, attempts: 0 };
          const nextStat: CharStat =
            result === "correct"
              ? { correctStreak: s.correctStreak + 1, wrongCount: s.wrongCount, attempts: s.attempts + 1 }
              : { correctStreak: 0, wrongCount: s.wrongCount + 1, attempts: s.attempts + 1 };
          return { ...prev, [current.char]: nextStat };
        });
      } else {
        setPrevItem({ key: nextKey(), char: current.char });
      }

      setCurrent(next);
      setNext(pickRandom(POOLS[mode], next.char));
      setInput("");
      setRevealed(false);
      itemStartRef.current = Date.now();
      itemWasIdleRef.current = false;
    },
    [current, next, mode, muted]
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
  const avgTimeSec = avgAnswerCount > 0 ? totalAnswerMs / avgAnswerCount / 1000 : 0;
  const minutes = elapsedSeconds / 60;
  const wpm = minutes > 0 ? Math.round(totalCorrectChars / 5 / minutes) : 0;

  const cardRing = revealed ? "border-amber-500/60" : "border-zinc-800";

  return (
    <div
      className="flex min-h-screen w-full flex-col bg-black font-mono text-zinc-50"
      onClick={() => {
        inputRef.current?.focus();
        setOptionsOpen(false);
      }}
    >
      <header className="grid grid-cols-3 items-start px-8 py-6">
        <div className="text-lg text-zinc-300">
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
                className={`rounded-md border px-3 py-1.5 text-base transition-colors ${
                  m === mode
                    ? "border-green-800/60 bg-green-950/30 text-green-400"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex justify-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setStatsOpen((o) => !o);
                inputRef.current?.focus();
              }}
              className={`rounded-md border px-3 py-1.5 text-base transition-colors ${
                statsOpen
                  ? "border-green-800/60 bg-green-950/30 text-green-400"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              stats
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLeaderboardOpen((o) => !o);
                inputRef.current?.focus();
              }}
              className={`rounded-md border px-3 py-1.5 text-base transition-colors ${
                leaderboardOpen
                  ? "border-green-800/60 bg-green-950/30 text-green-400"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              leaderboard
            </button>

            <div className="relative">
              <button
                aria-label="Options"
                title="Options"
                onClick={(e) => {
                  e.stopPropagation();
                  setOptionsOpen((o) => !o);
                }}
                className={`rounded-md border px-3 py-1.5 text-base transition-colors ${
                  optionsOpen
                    ? "border-green-800/60 bg-green-950/30 text-green-400"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                ⚙
              </button>

              {optionsOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-full right-0 z-50 mt-2 w-52 rounded-md border border-zinc-800 bg-zinc-950 p-3 shadow-xl"
                >
                  <label className="flex items-center gap-2 text-sm text-zinc-400 select-none">
                    <input
                      type="checkbox"
                      checked={skipAnimation}
                      onChange={(e) => setSkipAnimation(e.target.checked)}
                      className="accent-green-500"
                    />
                    disable animation
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-sm text-zinc-400 select-none">
                    <input
                      type="checkbox"
                      checked={muted}
                      onChange={(e) => setMuted(e.target.checked)}
                      className="accent-green-500"
                    />
                    mute audio
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 text-lg text-zinc-400">
          <span>{formatTime(elapsedSeconds)}</span>
          <button
            aria-label="Reset session"
            title="Reset session"
            onClick={(e) => {
              e.stopPropagation();
              resetSession(mode);
            }}
            className="text-2xl text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ↻
          </button>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden px-4">
        {current && next && (
          <>
            <div className="flex items-center justify-center gap-8 sm:gap-12">
              <div className="flex h-20 w-20 items-center justify-center">
                {prevItem && (
                  <div
                    key={prevItem.key}
                    className={`flex h-16 w-16 -rotate-12 items-center justify-center rounded-xl border text-5xl text-zinc-500 ${
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
                className={`flex h-48 w-48 items-center justify-center overflow-hidden rounded-3xl border bg-zinc-950 shadow-lg transition-colors duration-200 sm:h-64 sm:w-64 ${cardRing}`}
              >
                <span
                  key={`${current.char}-${seenCount}`}
                  className={`text-8xl font-medium select-none sm:text-9xl ${
                    skipAnimation ? "" : "animate-kana-grow-shrink"
                  }`}
                >
                  {current.char}
                </span>
              </div>

              <div className="flex h-20 w-20 items-center justify-center">
                <div
                  key={`${next.char}-${seenCount}`}
                  className={`flex h-16 w-16 rotate-12 items-center justify-center rounded-xl text-5xl text-zinc-600 opacity-50 ${
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
                className={`text-xs text-zinc-600 transition-opacity ${paused ? "opacity-100" : "opacity-0"}`}
              >
                statistics paused
              </p>

              <Link
                href="/practice"
                onClick={(e) => e.stopPropagation()}
                className={`rounded-md border px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 ${
                  practiceGlow ? "animate-practice-glow" : "border-zinc-800"
                }`}
              >
                {practiceStruggling ? "Practice? Learn the basics here!" : "Practice?"}
              </Link>
            </div>
          </>
        )}

        <div
          style={{ width: statsWidth.width, maxWidth: "90vw" }}
          className={`absolute inset-y-0 left-0 z-10 overflow-y-auto border-r border-zinc-800 bg-zinc-950 shadow-2xl transition-transform duration-300 ${
            statsOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
          }`}
        >
          <div
            onMouseDown={statsWidth.startDrag("left")}
            className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize hover:bg-zinc-700/60"
          />
          <button
            aria-label="Close stats"
            onClick={() => setStatsOpen(false)}
            className="absolute top-4 right-4 text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ✕
          </button>
          <StatsPanel charStats={charStats} script={statsScript} onScriptChange={setStatsScript} />
        </div>

        <div
          style={{ width: leaderboardWidth.width, maxWidth: "90vw" }}
          className={`absolute inset-y-0 right-0 z-10 overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl transition-transform duration-300 ${
            leaderboardOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
          }`}
        >
          <div
            onMouseDown={leaderboardWidth.startDrag("right")}
            className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize hover:bg-zinc-700/60"
          />
          <button
            aria-label="Close leaderboard"
            onClick={() => setLeaderboardOpen(false)}
            className="absolute top-4 right-4 text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ✕
          </button>
          <LeaderboardPanel mode={mode} />
        </div>
      </main>

      <div className="grid grid-cols-5 divide-x divide-zinc-900 border-t border-zinc-900 py-6">
        <Stat value={wpm} label="wpm" />
        <Stat value={`${accuracy}%`} label="accuracy" />
        <Stat value={streak} label="streak" />
        <Stat value={seenCount} label="seen" />
        <Stat value={`${avgTimeSec.toFixed(1)}s`} label="avg time" />
      </div>

      <div className="flex items-center gap-3 overflow-x-auto px-16 py-4">
        <span className="shrink-0 text-sm text-zinc-600">recent</span>
        {history.map((h) => (
          <div
            key={h.key}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${
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
      <span className="text-4xl font-semibold text-zinc-50">{value}</span>
      <span className="text-xs tracking-widest text-zinc-600 uppercase">{label}</span>
    </div>
  );
}

function LeaderboardPanel({ mode }: { mode: Mode }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const cacheRef = useRef<Partial<Record<Mode, { data: LeaderboardEntry[]; fetchedAt: number }>>>({});

  useEffect(() => {
    const cached = cacheRef.current[mode];
    if (cached && Date.now() - cached.fetchedAt < LEADERBOARD_REFRESH_MS) {
      setEntries(cached.data);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    supabase
      .from("kana_comp")
      .select("*")
      .eq("kana_type", mode)
      .eq("ld_placer", true)
      .order("time", { ascending: true })
      .limit(LEADERBOARD_SIZE)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(true);
        } else {
          const rows = data ?? [];
          cacheRef.current[mode] = { data: rows, fetchedAt: Date.now() };
          setEntries(rows);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <div className="flex h-full flex-col p-6 font-mono text-zinc-50">
      <h2 className="mb-4 text-lg text-zinc-200">{mode} leaderboard</h2>

      <Link
        href={`/compete/${mode}`}
        onClick={(e) => e.stopPropagation()}
        className="mb-6 rounded-md border border-green-800/60 bg-green-950/30 px-3 py-1.5 text-center text-sm text-green-400 transition-colors hover:bg-green-950/50"
      >
        compete
      </Link>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">loading…</div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-red-400">
          couldn&apos;t load the leaderboard
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-zinc-600">
          No scores yet — be the first to set a record!
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <li key={entry.id} className="rounded-md border border-zinc-800 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <span className="w-5 text-zinc-500">{i + 1}</span>
                  <span className={`${nameTextClass(entry.name.length)} text-zinc-200`}>{entry.name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-zinc-400">{formatDuration(entry.time)}</span>
                  <span className="text-xs text-zinc-600">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </span>
              </div>
              {entry.comment && (
                <div className={`mt-1 pl-8 ${nameTextClass(entry.comment.length)} text-zinc-500 italic`}>
                  {entry.comment}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StatsPanel({
  charStats,
  script,
  onScriptChange,
}: {
  charStats: Record<string, CharStat>;
  script: Script;
  onScriptChange: (s: Script) => void;
}) {
  const source = script === "hiragana" ? HIRAGANA : KATAKANA;
  const masteredCount = source.filter((k) => getMastery(charStats[k.char]) === "mastered").length;

  return (
    <div className="flex h-full flex-col p-6 font-mono text-zinc-50">
      <div className="mb-6 flex items-center justify-between pr-6">
        <h2 className="text-lg text-zinc-200">gojūon progress</h2>
        <span className="text-base text-zinc-500">
          {masteredCount} / {source.length}
        </span>
      </div>

      <div className="flex gap-6">
        <div className="grid grid-cols-5 content-start gap-2">
          {GOJUON_ROWS.flatMap((row, ri) =>
            row.map((idx, ci) =>
              idx === null ? (
                <div key={`${ri}-${ci}`} className="h-11 w-11" />
              ) : (
                <div
                  key={`${ri}-${ci}`}
                  className={`group relative flex h-11 w-11 items-center justify-center rounded-lg border text-lg ${masteryClasses(
                    getMastery(charStats[source[idx].char])
                  )}`}
                >
                  {source[idx].char}
                  <span className="pointer-events-none absolute -top-7 left-1/2 z-20 hidden -translate-x-1/2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs whitespace-nowrap text-zinc-100 group-hover:block">
                    {source[idx].answers[0]}
                  </span>
                </div>
              )
            )
          )}
        </div>

        <div className="flex w-32 shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {(["hiragana", "katakana"] as const).map((s) => (
              <button
                key={s}
                onClick={() => onScriptChange(s)}
                className={`rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                  s === script
                    ? "border-green-800/60 bg-green-950/30 text-green-400"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 text-sm text-zinc-400">
            {MASTERY_LEGEND.map((l) => (
              <div key={l.key} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${l.dot}`} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
