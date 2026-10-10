import { Filter } from "bad-words";

const filter = new Filter();

export function isInappropriateName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return filter.isProfane(trimmed);
}

// Comments are optional, so an empty one is fine — only check profanity
// once there's actually something typed.
export function isInappropriateComment(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return filter.isProfane(trimmed);
}
