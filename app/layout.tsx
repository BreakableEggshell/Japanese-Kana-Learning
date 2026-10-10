import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const REPO_URL = "https://github.com/BreakableEggshell/Japanese-Kana-Learning";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "kana.drill",
  description: "Practice hiragana and katakana by typing the romaji reading.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed right-4 bottom-4 z-40 text-xs text-zinc-600 transition-colors hover:text-zinc-300"
        >
          Bugs? Suggestions? Or wanna learn Japanese together?
        </a>
      </body>
    </html>
  );
}
