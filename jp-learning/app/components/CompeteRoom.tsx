"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HIRAGANA, KATAKANA, GOJUON_ROWS, type KanaEntry } from "@/app/lib/kana";
import {
  isDead,
  isSettled,
  MIN_CHARS_BEFORE_WRONG,
  NAME_MAX_LENGTH,
  nameTextClass,
  playSound,
  formatDuration,
} from "@/app/lib/kana-input";
import {
  supabase,
  LEADERBOARD_SIZE,
  estimatePlacement,
  submitScore,
  type KanaType,
  type LeaderboardEntry,
} from "@/app/lib/supabase";
import { isInappropriateName, isInappropriateComment } from "@/app/lib/name-filter";
import { useResizablePanel } from "@/app/lib/use-resizable-panel";

type Script = "hiragana" | "katakana";
type Result = "correct" | "wrong";

type HistoryItem = {
  key: number;
  char: string;
  romaji: string;
  result: Result;
};

const POOLS: Record<KanaType, KanaEntry[]> = {
  hiragana: HIRAGANA,
  katakana: KATAKANA,
  mixed: [...HIRAGANA, ...KATAKANA],
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

let keySeq = 0;
const nextKey = () => keySeq++;

export default function CompeteRoom({ kanaType }: { kanaType: KanaType }) {
  const pool = POOLS[kanaType];

  const [current, setCurrent] = useState<KanaEntry | null>(null);
  const [queue, setQueue] = useState<KanaEntry[]>([]);
  const [input, setInput] = useState("");

  const [charResult, setCharResult] = useState<Record<string, Result>>({});
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalCorrectChars, setTotalCorrectChars] = useState(0);
  const [totalAnswerMs, setTotalAnswerMs] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finalTimeMs, setFinalTimeMs] = useState(0);

  const [skipAnimation, setSkipAnimation] = useState(false);
  const [muted, setMuted] = useState(false);
  const [resetOnMistake, setResetOnMistake] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(true);
  const [leaderboardOpen, setLeaderboardOpen] = useState(true);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [statsScript, setStatsScript] = useState<Script>(kanaType === "katakana" ? "katakana" : "hiragana");

  const [qualifyingPlace, setQualifyingPlace] = useState<number | null>(null);
  const [showCongrats, setShowCongrats] = useState(false);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [finalPlacement, setFinalPlacement] = useState<number | null>(null);

  const startTimeRef = useRef(Date.now());
  const itemStartRef = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const statsWidth = useResizablePanel(480);
  const leaderboardWidth = useResizablePanel(480);

  const startRun = useCallback(() => {
    const shuffled = shuffle(pool);
    setCurrent(shuffled[0] ?? null);
    setQueue(shuffled.slice(1));
    setInput("");
    setCharResult({});
    setCorrectCount(0);
    setWrongCount(0);
    setStreak(0);
    setTotalCorrectChars(0);
    setTotalAnswerMs(0);
    setHistory([]);
    setElapsedMs(0);
    setFinished(false);
    setFinalTimeMs(0);
    setQualifyingPlace(null);
    setShowCongrats(false);
    setName("");
    setComment("");
    setNameError(null);
    setCommentError(null);
    setSubmitted(false);
    setSubmitError(false);
    setFinalPlacement(null);
    setRunning(false);
  }, [pool]);

  const beginRunIfNeeded = useCallback(() => {
    if (running) return;
    const now = Date.now();
    startTimeRef.current = now;
    itemStartRef.current = now;
    setRunning(true);
  }, [running]);

  useEffect(() => {
    startRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 31);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [current, finished]);

  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    estimatePlacement(finalTimeMs, kanaType).then((place) => {
      if (cancelled || place === null) return;
      if (place <= LEADERBOARD_SIZE) {
        setQualifyingPlace(place);
        setShowCongrats(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [finished, finalTimeMs, kanaType]);

  const finishRun = useCallback(() => {
    const total = Date.now() - startTimeRef.current;
    setElapsedMs(total);
    setFinalTimeMs(total);
    setRunning(false);
    setFinished(true);
    setCurrent(null);
  }, []);

  const advance = useCallback(
    (result: Result) => {
      if (!current) return;
      playSound(result === "correct" ? "/correct.mp3" : "/wrong.mp3", muted);

      const itemElapsed = Date.now() - itemStartRef.current;
      setTotalAnswerMs((t) => t + itemElapsed);
      setHistory((prev) =>
        [...prev, { key: nextKey(), char: current.char, romaji: current.answers[0], result }].slice(-10)
      );

      if (result === "correct") {
        setCorrectCount((c) => c + 1);
        setStreak((s) => s + 1);
        setTotalCorrectChars((c) => c + current.answers[0].length);
      } else {
        setWrongCount((c) => c + 1);
        setStreak(0);
      }
      // Once a kana has been gotten wrong this run, keep it flagged red even
      // if it's answered correctly later (it stays in the queue until then).
      setCharResult((prev) => ({ ...prev, [current.char]: prev[current.char] === "wrong" ? "wrong" : result }));
      itemStartRef.current = Date.now();

      if (resetOnMistake && result === "wrong") {
        startRun();
        return;
      }

      const nextQueue = result === "wrong" ? [...queue, current] : queue;
      if (nextQueue.length === 0) {
        finishRun();
        return;
      }
      const [head, ...rest] = nextQueue;
      setCurrent(head);
      setQueue(rest);
      setInput("");
    },
    [current, queue, muted, resetOnMistake, startRun, finishRun]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!current) return;
    const raw = e.target.value.toLowerCase().replace(/[^a-z]/g, "");
    setInput(raw);
    if (!raw) return;
    beginRunIfNeeded();

    if (isSettled(raw, current.answers)) {
      advance("correct");
    } else if (raw.length >= MIN_CHARS_BEFORE_WRONG && isDead(raw, current.answers)) {
      advance("wrong");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!current) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (!input.trim()) return;
      beginRunIfNeeded();
      const isCorrect = current.answers.includes(input);
      advance(isCorrect ? "correct" : "wrong");
    }
  }

  async function handleConfirmName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const trimmedComment = comment.trim();
    if (!trimmed) {
      setNameError("enter a name");
      return;
    }
    if (isInappropriateName(trimmed)) {
      setNameError("please choose an appropriate name");
      return;
    }
    if (isInappropriateComment(trimmedComment)) {
      setCommentError("please choose an appropriate comment");
      return;
    }
    setNameError(null);
    setCommentError(null);
    setSubmitting(true);
    const { data, error } = await submitScore(
      trimmed.slice(0, NAME_MAX_LENGTH),
      finalTimeMs,
      kanaType,
      trimmedComment.slice(0, NAME_MAX_LENGTH)
    );
    setSubmitting(false);
    if (error) {
      setSubmitError(true);
      return;
    }
    setFinalPlacement(typeof data === "number" ? data : qualifyingPlace);
    setSubmitted(true);
    setShowCongrats(false);
    setLeaderboardRefreshKey((k) => k + 1);
  }

  function handleCancelPopup() {
    setShowCongrats(false);
  }

  const seenCount = correctCount + wrongCount;
  const accuracy = seenCount > 0 ? Math.round((correctCount / seenCount) * 100) : 100;
  const avgTimeSec = seenCount > 0 ? totalAnswerMs / seenCount / 1000 : 0;
  const minutes = elapsedMs / 1000 / 60;
  const wpm = minutes > 0 ? Math.round(totalCorrectChars / 5 / minutes) : 0;

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
            <span className="rounded-md border border-green-800/60 bg-green-950/30 px-3 py-1.5 text-base text-green-400">
              {kanaType}
            </span>
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
                  className="absolute top-full right-0 z-50 mt-2 w-56 rounded-md border border-zinc-800 bg-zinc-950 p-3 shadow-xl"
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
                  <label className="mt-2 flex items-center gap-2 text-sm text-zinc-400 select-none">
                    <input
                      type="checkbox"
                      checked={resetOnMistake}
                      onChange={(e) => setResetOnMistake(e.target.checked)}
                      className="accent-green-500"
                    />
                    reset on mistake
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div />
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-4">
        {!finished && (
          <div className="text-2xl text-zinc-300 tabular-nums">
            {running ? formatDuration(elapsedMs) : "Start typing when you're ready"}
          </div>
        )}

        {!finished && current ? (
          <>
            <div className="flex items-center justify-center gap-8 sm:gap-12">
              <div className="flex h-20 w-20 items-center justify-center" />

              <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-lg sm:h-64 sm:w-64">
                <span
                  key={current.char}
                  className={`text-8xl font-medium select-none sm:text-9xl ${
                    skipAnimation ? "" : "animate-kana-grow-shrink"
                  }`}
                >
                  {current.char}
                </span>
              </div>

              <div className="flex h-20 w-20 items-center justify-center">
                {queue[0] && (
                  <div
                    key={queue[0].char}
                    className={`flex h-16 w-16 rotate-12 items-center justify-center rounded-xl text-5xl text-zinc-600 opacity-50 ${
                      skipAnimation ? "" : "animate-kana-pop"
                    }`}
                  >
                    {queue[0].char}
                  </div>
                )}
              </div>
            </div>

            <div className="relative flex items-center justify-center border-b border-zinc-800 pb-2">
              <div className="flex min-h-9 min-w-[3ch] items-center text-2xl">
                <span className="text-white">{input}</span>
                <span className="ml-0.5 h-6 w-2.5 animate-blink bg-white" />
              </div>
              <input
                ref={inputRef}
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                aria-label="Romaji input"
                className="absolute inset-0 h-full w-full cursor-default opacity-0"
              />
            </div>
          </>
        ) : (
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-green-800/60 bg-green-950/10 px-8 py-10 text-center">
            <div className="text-lg text-green-400">finished!</div>
            <div className="text-4xl text-zinc-50">{formatDuration(finalTimeMs)}</div>
            <div className="text-sm text-zinc-500">
              {correctCount} correct · {wrongCount} wrong
            </div>

            {submitted && (
              <div className="mt-2 text-sm text-green-400">
                you&apos;re #{finalPlacement} on the leaderboard!
              </div>
            )}
            {submitError && (
              <div className="mt-2 text-sm text-red-400">couldn&apos;t submit your score — try again</div>
            )}
          </div>
        )}

        {showCongrats && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-sm rounded-2xl border border-green-800/60 bg-zinc-950 p-6 text-center">
              <div className="text-lg text-green-400">おめでとう！you reached #{qualifyingPlace}!</div>
              <form onSubmit={handleConfirmName} className="mt-4 flex flex-col gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="your name"
                  maxLength={NAME_MAX_LENGTH}
                  autoFocus
                  className={`rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 ${nameTextClass(
                    name.length
                  )} text-zinc-100 outline-none focus:border-zinc-600`}
                />
                {nameError && <div className="text-xs text-red-400">{nameError}</div>}
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="comment (optional)"
                  maxLength={NAME_MAX_LENGTH}
                  className={`rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 ${nameTextClass(
                    comment.length
                  )} text-zinc-100 outline-none focus:border-zinc-600`}
                />
                {commentError && <div className="text-xs text-red-400">{commentError}</div>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancelPopup}
                    className="flex-1 rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-md border border-green-800/60 bg-green-950/30 px-3 py-1.5 text-sm text-green-400 transition-colors hover:bg-green-950/50 disabled:opacity-40"
                  >
                    {submitting ? "..." : "submit"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Link
            href="/"
            onClick={(e) => e.stopPropagation()}
            className="rounded-md border border-red-800/60 bg-red-950/30 px-4 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-950/50"
          >
            exit
          </Link>
          <button
            onClick={(e) => {
              e.stopPropagation();
              startRun();
            }}
            className="rounded-md border border-green-800/60 bg-green-950/30 px-4 py-1.5 text-sm text-green-400 transition-colors hover:bg-green-950/50"
          >
            retry
          </button>
        </div>

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
          <CompeteStatsPanel charResult={charResult} script={statsScript} onScriptChange={setStatsScript} />
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
          <CompeteLeaderboardPanel kanaType={kanaType} refreshKey={leaderboardRefreshKey} />
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
                : "border-red-900/60 bg-red-950/40 text-red-400"
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

function CompeteStatsPanel({
  charResult,
  script,
  onScriptChange,
}: {
  charResult: Record<string, Result>;
  script: Script;
  onScriptChange: (s: Script) => void;
}) {
  const source = script === "hiragana" ? HIRAGANA : KATAKANA;
  const correctInScript = source.filter((k) => charResult[k.char] === "correct").length;

  function cellClasses(result: Result | undefined) {
    if (result === "correct") return "border-green-800/60 bg-green-950/40 text-green-400";
    if (result === "wrong") return "border-red-800/60 bg-red-950/40 text-red-400";
    return "border-zinc-800 bg-zinc-900/40 text-zinc-600";
  }

  return (
    <div className="flex h-full flex-col p-6 font-mono text-zinc-50">
      <div className="mb-6 flex items-center justify-between pr-6">
        <h2 className="text-lg text-zinc-200">gojūon progress</h2>
        <span className="text-base text-green-400">
          {correctInScript}/{source.length} correct
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
                  className={`group relative flex h-11 w-11 items-center justify-center rounded-lg border text-lg ${cellClasses(
                    charResult[source[idx].char]
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
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              correct
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              wrong
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompeteLeaderboardPanel({ kanaType, refreshKey }: { kanaType: KanaType; refreshKey: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    supabase
      .from("kana_comp")
      .select("*")
      .eq("kana_type", kanaType)
      .eq("ld_placer", true)
      .order("time", { ascending: true })
      .limit(LEADERBOARD_SIZE)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(true);
        } else {
          setEntries(data ?? []);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kanaType, refreshKey]);

  return (
    <div className="flex h-full flex-col p-6 font-mono text-zinc-50">
      <h2 className="mb-6 text-lg text-zinc-200">{kanaType} leaderboard</h2>

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
