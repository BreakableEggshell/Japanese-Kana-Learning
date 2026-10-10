# Japanese Kana Trainer

A typing trainer for learning hiragana and katakana. A kana appears, you type its romaji, and the app tracks how well you know each character. When you're ready, race through the full set against the clock and post your time to a shared leaderboard.

Live at [japanese-kana.dcism.org](https://japanese-kana.dcism.org).

## Features

- **Free play** (`/`): endless drill in hiragana, katakana or mixed mode. Answers are checked as you type, with no need to press Enter. Alternate romanizations are accepted (`shi`/`si`, `tsu`/`tu`, `fu`/`hu`, …).
- **Practice** (`/practice`): choose which gojūon rows to drill, so you can learn the kana a few rows at a time.
- **Compete** (`/compete/hiragana`, `/compete/katakana`, `/compete/mixed`): a timed run through every kana in the set. Kana you get wrong go back into the queue. If your time makes the top 15, you can submit a name and an optional comment to the leaderboard.
- **Stats**: WPM, accuracy, streak, average answer time, and a gojūon chart that marks each kana as *mastered*, *learning*, *needs work* or *not started*.
- **Options**: mute sound effects, disable animations, and (in compete mode) restart the run on any mistake.
- Leaderboard names and comments go through a profanity filter.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) with React 19 and TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [Supabase](https://supabase.com) for the leaderboard
- [`bad-words`](https://www.npmjs.com/package/bad-words) for name and comment filtering

## Getting started

```bash
npm install
```

Optionally, to enable the leaderboard, create a `.env` file in the project root with your Supabase project's credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase setup

This section is optional. Free play and practice work without a database. The leaderboard needs two things in Supabase.

**1. A `kana_comp` table**

| Column       | Type          | Notes                                      |
| ------------ | ------------- | ------------------------------------------ |
| `id`         | `uuid`        | Primary key                                |
| `name`       | `text`        | Player name (max 25 characters)            |
| `time`       | `integer`     | Run time in milliseconds                   |
| `created_at` | `timestamptz` | Defaults to `now()`                        |
| `kana_type`  | `text`        | `hiragana`, `katakana` or `mixed`          |
| `ld_placer`  | `boolean`     | `true` while the entry is in the top 15    |
| `comment`    | `text`        | Optional, nullable                         |

**2. A `submit_score` RPC function**

It takes `p_name`, `p_time`, `p_kana_type` and `p_comment`. It inserts the score, re-ranks that kana type's leaderboard so only the top 15 keep `ld_placer = true`, and returns the new entry's placement (1-indexed), or `null` if it didn't place.

The anon key must be allowed to read `kana_comp` and execute `submit_score`.

## Project structure

```
├── app/
│   ├── page.tsx                  # Free play
│   ├── practice/page.tsx         # Practice by gojūon row
│   ├── compete/[type]/page.tsx   # Timed runs + leaderboard
│   ├── components/
│   │   ├── KanaQuiz.tsx
│   │   ├── PracticeQuiz.tsx
│   │   └── CompeteRoom.tsx
│   └── lib/
│       ├── kana.ts               # Kana data and gojūon layout
│       ├── kana-input.ts         # Answer checking, timing, sounds
│       ├── supabase.ts           # Client and leaderboard queries
│       ├── name-filter.ts        # Profanity filter
│       └── use-resizable-panel.ts
└── public/                       # Sound effects
```
