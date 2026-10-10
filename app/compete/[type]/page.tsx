import { notFound } from "next/navigation";
import CompeteRoom from "@/app/components/CompeteRoom";
import type { KanaType } from "@/app/lib/supabase";

const VALID_TYPES: KanaType[] = ["hiragana", "katakana", "mixed"];

export default async function CompeteTypePage({ params }: PageProps<"/compete/[type]">) {
  const { type } = await params;

  if (!VALID_TYPES.includes(type as KanaType)) {
    notFound();
  }

  return <CompeteRoom kanaType={type as KanaType} />;
}
