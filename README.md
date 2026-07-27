# FitTrack 💪

A science-backed, installable web app for nutrition and workout tracking. Built with TanStack Start, Astryx DS, and SQLite.

## Features

### Nutrition Tracking
- Food database with 55+ common foods (proteins, carbs, fats, vegetables)
- Daily calorie and macro tracking with progress visualization
- Science-backed macro calculations (Mifflin-St Jeor BMR, evidence-based protein targets)
- Meal categorization (breakfast, lunch, dinner, snack)
- Barcode scanning for packaged foods you have logged before (camera or manual entry)

### Workout Logging
- Exercise library with 30+ exercises across all muscle groups
- Set/rep/RPE tracking with autoregulation guidance
- Volume calculation and estimated 1RM (Epley equation)
- Progressive overload suggestions based on RPE

### Progress Analytics
- Weight trend visualization with SVG charts
- Workout frequency tracking (30/90 day windows)
- Body composition logging

### Offline Support
- Service worker caches the app shell, static assets, and reference data
- Food database, exercise library, and the last 14 days of logs are stored in IndexedDB
- Meals, sets, and weigh-ins recorded offline are queued and replayed on reconnect
- Replay is idempotent: every queued change carries a client-generated id, so a
  retried sync cannot duplicate a meal or a set

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

Barcode scanning uses the device camera via `getUserMedia`, which requires **HTTPS** in production. Local development on `http://localhost` is exempt from that restriction.


### Push Notifications

Web Push lets the installed PWA reach you when the app is in the background (rest timer complete, future reminders).

Generate a VAPID keypair once and add both values to `.env` (never commit them):

```bash
npx web-push generate-vapid-keys --json
```

| Variable | Purpose |
|----------|---------|
| `VAPID_PUBLIC_KEY` | Served to the browser for `PushManager.subscribe` |
| `VAPID_PRIVATE_KEY` | Signs outgoing pushes — server only |
| `VAPID_SUBJECT` | Contact URI (`mailto:` or `https:`) for push services |

When `VAPID_PUBLIC_KEY` is absent, Settings shows a "push not configured" state instead of throwing. On iOS, Web Push requires installing FitTrack to the Home Screen (iOS 16.4+).

## Install as PWA

1. Open the app in Chrome/Edge
2. Click the install icon in the address bar
3. Or use menu > "Install FitTrack"

The app works offline once installed. The service worker is registered in
production builds only (`npm run build && npm run start`), so a dev server is
never shadowed by a cached shell. Anything logged while offline is held on the
device and syncs automatically once the connection returns; the banner at the
top of the app shows what is still waiting.

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
├── public/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service worker (app shell + asset caching)
│   └── offline.html        # Fallback page for uncached routes
├── scripts/
│   ├── seed.mjs            # Database seeding
│   └── dev-loop.sh         # Self-improving AI dev loop
├── src/
│   ├── lib/
│   │   ├── api.ts          # TanStack Start server functions
│   │   ├── db.ts           # SQLite connection + types
│   │   ├── schema.sql      # Database schema
│   │   ├── nutrition.ts    # Science-backed nutrition calculations
│   │   ├── workout.ts      # Science-backed workout calculations
│   │   ├── offline.ts      # IndexedDB cache + offline mutation outbox
│   │   └── sync.ts         # Shared offline queue contract
│   ├── components/
│   │   └── OfflineStatus.tsx  # Connectivity + pending sync banner
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
