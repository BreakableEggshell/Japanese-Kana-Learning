import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type KanaType = "hiragana" | "katakana" | "mixed";

export const LEADERBOARD_SIZE = 15;

export type LeaderboardEntry = {
  id: string;
  name: string;
  time: number;
  created_at: string;
  kana_type: KanaType;
  ld_placer: boolean;
  comment: string | null;
};

// Inserts a new score and re-ranks the leaderboard for that kana type,
// demoting anything that fell outside the top LEADERBOARD_SIZE (see submit_score() in Supabase).
// Returns the new entry's placement (1-indexed), or null if it didn't rank at all.
export async function submitScore(name: string, timeMs: number, kanaType: KanaType, comment: string) {
  return supabase.rpc("submit_score", {
    p_name: name,
    p_time: timeMs,
    p_kana_type: kanaType,
    p_comment: comment || null,
  });
}

// Read-only check of what place a time would currently earn, without writing anything.
export async function estimatePlacement(timeMs: number, kanaType: KanaType) {
  const { count, error } = await supabase
    .from("kana_comp")
    .select("*", { count: "exact", head: true })
    .eq("kana_type", kanaType)
    .eq("ld_placer", true)
    .lt("time", timeMs);

  if (error) return null;
  return (count ?? 0) + 1;
}
