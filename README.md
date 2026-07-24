# FitTrack 💪

A science-backed, installable web app for nutrition and workout tracking. Built with TanStack Start, Astryx DS, and SQLite.

## Features

### Nutrition Tracking
- Food database with 55+ common foods (proteins, carbs, fats, vegetables)
- Daily calorie and macro tracking with progress visualization
- Science-backed macro calculations (Mifflin-St Jeor BMR, evidence-based protein targets)
- Meal categorization (breakfast, lunch, dinner, snack)

### Workout Logging
- Exercise library with 30+ exercises across all muscle groups
- Set/rep/RPE tracking with autoregulation guidance
- Volume calculation and estimated 1RM (Epley equation)
- Progressive overload suggestions based on RPE

### Progress Analytics
- Weight trend visualization with SVG charts
- Workout frequency tracking (30/90 day windows)
- Body composition logging

## Science References

| Metric | Formula | Reference |
|--------|---------|-----------|
| BMR | Mifflin-St Jeor | Mifflin et al. Am J Clin Nutr. 1990 |
| Protein (hypertrophy) | 1.6-2.2 g/kg | Morton et al. Br J Sports Med. 2018 |
| Protein (deficit) | 2.2-3.1 g/kg FFM | Helms et al. IJSNEM. 2014 |
| 1RM | Epley equation | Epley B. 1985 |
| RPE/RIR | Autoregulation | Zourdos et al. JSCR. 2016 |
| Volume | 10-20 sets/muscle/week | Schoenfeld et al. JSCR. 2017 |

## Getting Started

```bash
# Install dependencies
npm install

# Seed the database with foods and exercises
npm run db:seed

# Start the dev server
npm run dev
```

The app runs at http://localhost:3000

## Install as PWA

1. Open the app in Chrome/Edge
2. Click the install icon in the address bar
3. Or use menu > "Install FitTrack"

The app works offline once installed.

## Tech Stack

- **Framework:** TanStack Start (React 19, SSR, file-based routing)
- **UI:** Astryx DS (@astryxdesign/core, theme-neutral)
- **Database:** SQLite via better-sqlite3
- **Styling:** Plain CSS + Astryx design tokens

## Self-Improving Dev Loop

The project includes a development loop that iteratively improves the app using AI models:

```bash
# Run one iteration (picks next GitHub issue, implements it)
npm run dev-loop

# Run multiple iterations
npm run dev-loop -- --max 5

# Dry run (see what it would do)
npm run dev-loop -- --dry-run

# Work on a specific issue
npm run dev-loop -- --issue 3
```

The loop uses models from most powerful to least powerful, falling back when rate limits are hit. It tracks learnings in `.dev-loop/learnings.json`.

## Project Structure

```
fitness/
├── prd/                    # Product requirements documents
├── public/                 # Static assets, PWA manifest
├── scripts/
│   ├── seed.mjs            # Database seeding
│   └── dev-loop.sh         # Self-improving AI dev loop
├── src/
│   ├── lib/
│   │   ├── api.ts          # TanStack Start server functions
│   │   ├── db.ts           # SQLite connection + types
│   │   ├── schema.sql      # Database schema
│   │   ├── nutrition.ts    # Science-backed nutrition calculations
│   │   └── workout.ts      # Science-backed workout calculations
│   ├── routes/
│   │   ├── __root.tsx      # Root layout with navigation
│   │   ├── index.tsx       # Dashboard
│   │   ├── nutrition/      # Nutrition tracking
│   │   ├── workout/        # Workout logging
│   │   ├── progress/       # Progress analytics
│   │   └── settings/       # Profile & goals
│   ├── styles/app.css      # Global CSS with Astryx theme
│   └── router.tsx          # Router configuration
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## License

MIT
