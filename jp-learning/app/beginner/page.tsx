import Link from "next/link";

export default function BeginnerPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-black font-mono text-zinc-50">
      <div className="px-8 py-6">
        <Link href="/" className="text-sm text-zinc-500 transition-colors hover:text-zinc-300">
          ← back
        </Link>
      </div>
    </div>
  );
}
