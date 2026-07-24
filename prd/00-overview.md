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
2. **Privacy** - All data stored locally in SQLite. No cloud, no tracking.
3. **Installable** - Works as a PWA, installable on any device.
4. **Simple UX** - Fast food logging, effortless workout tracking.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
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
- [ ] Meal planning and recipes
- [ ] Training programs with periodization
- [ ] Volume analysis per muscle group
- [ ] Weekly/monthly nutrition reports
- [ ] Custom food creation
- [ ] Barcode scanner integration (camera API)

### Phase 3: Advanced
- [ ] AI-powered meal suggestions
- [ ] Auto-regulated training (RPE-based progression)
- [ ] Sleep and recovery tracking
- [ ] Supplements log
- [ ] Export/import data (CSV/JSON)
- [ ] Multi-user support

### Phase 4: Polish
- [x] Offline-first service worker
- [ ] Push notifications (meal reminders)
- [ ] Dark mode toggle
- [ ] Internationalization
- [ ] Comprehensive test suite

## Science References

| Metric | Formula | Reference |
|--------|---------|-----------|
| BMR | Mifflin-St Jeor | Mifflin MD et al. Am J Clin Nutr. 1990 |
| TDEE | BMR x Activity Factor | Harris JA, Benedict FG. 1919 (multipliers updated) |
| Protein (hypertrophy) | 1.6-2.2 g/kg | Morton RW et al. Br J Sports Med. 2018 |
| Protein (deficit) | 2.2-3.1 g/kg FFM | Helms ER et al. IJSNEM. 2014 |
| 1RM | Epley equation | Epley B. 1985 |
| RIR/RPE | Autoregulation | Zourdos MC et al. J Strength Cond Res. 2016 |
| Volume | 10-20 sets/muscle/week | Schoenfeld BJ et al. JSCR. 2017 |
| Frequency | 2x/week per muscle | Schoenfeld BJ et al. Sports Med. 2019 |
