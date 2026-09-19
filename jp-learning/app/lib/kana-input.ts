export const MIN_CHARS_BEFORE_WRONG = 2;

// True once no valid answer can still start with this input.
export function isDead(input: string, answers: string[]) {
  return !answers.some((a) => a.startsWith(input));
}

// True once input exactly matches an answer that no longer answer extends.
export function isSettled(input: string, answers: string[]) {
  if (!answers.includes(input)) return false;
  return !answers.some((a) => a !== input && a.length > input.length && a.startsWith(input));
}

export function playSound(src: string, muted: boolean) {
  if (muted) return;
  const audio = new Audio(src);
  audio.play().catch(() => {});
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const msPart = Math.floor(ms % 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
}
