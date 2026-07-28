# FitTrack - Product Requirements Document

## Vision

A science-backed, installable web application that serves as a comprehensive companion for nutrition and workout tracking. Every calculation and recommendation is grounded in peer-reviewed exercise science and sports nutrition research.

## Target User

Individuals focused on performance and physique improvement who want:

- Accurate calorie and macro tracking
- Evidence-based training logging
- Progressive overload tracking
- Clear, actionable daily targets

## Core Principles

1. **Science-first** - Every formula has a citation. No bro-science.
2. **Your data, not ours** - Server-side SQLite, per-user accounts, no third-party analytics or trackers, no data sale, full export at any time. Self-hostable as a single file database.
3. **Installable** - A PWA installed to the phone home screen is the primary way the app is used. Desktop is secondary.
4. **Fast to log** - Logging a repeated meal or set must cost no more than two taps. Adherence is the outcome that matters, and friction is what destroys it.

### Note on principle 2

This principle previously read _"All data stored locally in SQLite. No cloud, no tracking."_ That was incompatible with the accounts, hosted deployment, and marketing site introduced in PRD 08 — a hosted multi-user web app cannot claim data never leaves the device.

The architecture is settled as: **a hosted web app, a server-side SQLite database, per-user accounts via Better Auth, installed on the phone as a PWA.** Principle 2 is restated above to describe that honestly. The privacy commitment is real but narrower than "no cloud": no trackers, no third-party analytics, no data sale, full export, and a single-file database anyone can self-host.

Offline still works — `src/lib/offline.ts` keeps a cached data bundle and an outbox of typed mutations with idempotency keys — but offline capability is not the same claim as local-only storage.

## Tech Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Framework | TanStack Start (React 19) | Full-stack, type-safe, SSR |
| UI | Astryx DS (@astryxdesign/core) | Meta's design system, 150+ components |
| Database | SQLite (better-sqlite3) | Embedded, zero-config, fast |
| Job Queue | @platformatic/job-queue | Background tasks (if needed) |
| PWA | Web Manifest + Service Worker | Installable, offline-capable |

## Feature Roadmap

### Phase 1: MVP (Current)

- [x] Dashboard with daily calorie/macro summary
- [x] Nutrition tracking with food database
- [x] Workout session logging with sets/reps/RPE
- [x] Progress tracking (weight, workouts)
- [x] Settings (profile, BMR inputs, goals)
- [x] PWA manifest

### Phase 2: Enhanced Features

- [x] Meal planning and recipes
- [x] Training programs with periodization
- [x] Volume analysis per muscle group
- [x] Weekly/monthly nutrition reports
- [x] Custom food creation
- [ ] Barcode scanner integration (camera API) — PRD 09 Batch 5

### Phase 3: Make It Fast and Sticky (current priority)

The MVP tracks everything and returns nobody. This phase is the product work that was missing from the roadmap: reduce logging cost, close the training loop, and give the user a reason to come back.

- [ ] Logging velocity — recent/frequent foods, copy yesterday, one-tap templates, quick add, barcode — **PRD 09**
- [ ] Training loop — last-time context on free-form sets, rest timer, PR detection, session summary — **PRD 10**
- [ ] Consistency and retention — adherence tracking, weekly review, Web Push notifications — **PRD 11**
- [ ] Mobile and PWA hardening — installable icons, safe areas, gym-grade touch targets, mobile + a11y test infrastructure — **PRD 12**
- [ ] Autonomous verification harness — e2e in the loop, design gates as tests, priority-ordered issue selection — **PRD 13**

### Phase 4: Advanced

- [ ] Auto-regulated training (extend RPE progression to full autoregulation)
- [ ] Sleep and recovery tracking
- [ ] Supplements log
- [ ] AI-powered meal suggestions
- [x] Export data (JSON)
- [ ] Import data (CSV/JSON)

### Phase 5: Polish

- [x] Offline-first service worker
- [x] Dark mode
- [ ] Internationalization
- [ ] Comprehensive test suite (mobile + a11y coverage via PRD 12/13)

## Working Method

Every issue is implemented, verified, and closed by `scripts/dev-loop.sh` with no human in the path. This has a direct consequence for how requirements are written:

> **A requirement must be expressed as a measurable assertion.** If a criterion cannot be checked by a test, it is rewritten until it can, or dropped.

Subjective goals ("premium", "calm", "numbers are heroes") are translated into computed-style and source-scan gates. PRD 13 builds that harness and PRD 12 Batch 4 supplies the mobile and accessibility coverage it needs.

## Science References

| Metric | Formula | Reference |
| --- | --- | --- |
| BMR | Mifflin-St Jeor | Mifflin MD et al. Am J Clin Nutr. 1990 |
| TDEE | BMR x Activity Factor | Harris JA, Benedict FG. 1919 (multipliers updated) |
| Protein (hypertrophy) | 1.6-2.2 g/kg | Morton RW et al. Br J Sports Med. 2018 |
| Protein (deficit) | 2.2-3.1 g/kg FFM | Helms ER et al. IJSNEM. 2014 |
| 1RM | Epley equation | Epley B. 1985 |
| RIR/RPE | Autoregulation | Zourdos MC et al. J Strength Cond Res. 2016 |
| Volume | 10-20 sets/muscle/week | Schoenfeld BJ et al. JSCR. 2017 |
| Frequency | 2x/week per muscle | Schoenfeld BJ et al. Sports Med. 2019 |
