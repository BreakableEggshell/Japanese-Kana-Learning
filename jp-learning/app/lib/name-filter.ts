import { Filter } from "bad-words";

const filter = new Filter();

export function isInappropriateName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return filter.isProfane(trimmed);
}
