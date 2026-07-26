# PRD: Apple-Level UI/UX Refinement

## Philosophy

> "Design is not just what it looks like and feels like. Design is how it works." — Steve Jobs

If Apple shipped a fitness tracking app, it would be:

- **Calm**: No clutter. Generous whitespace. Every element earns its place.
- **Confident**: Large, clear typography. Bold numbers for metrics. Never timid.
- **Responsive**: Every touch has immediate feedback — haptic-feeling animations, smooth transitions.
- **Human**: Real-world language ("Log lunch" not "Create food_log entry"). Helpful guidance, never error messages that blame the user.
- **Effortless**: The happy path is frictionless. Power features are discoverable but never in the way.
- **Beautiful**: Dark mode isn't just inverted colors — it's a deliberately crafted aesthetic. Light mode feels clean and airy.

## Current State

After the Astryx migration and state cleanup, the app uses the right components but doesn't **feel** polished:

- Dashboard data is dumped in cards without visual hierarchy
- Numbers that matter (calories, weight, volume) don't stand out
- No animation or motion — everything snaps instantly
- Page layouts don't breathe — content edge-to-edge with no rhythm
- The "personality" is generic — nothing makes this app feel uniquely crafted
- No onboarding flow — first-time users see empty data with no guidance

## Design Principles (Apple-Inspired, Astryx-Powered)

### 1. Typographic Hierarchy — Numbers Are Heroes
Apple's Fitness app makes the **number** the star. The unit is secondary.

```
Current:  165 kcal (all same weight)
Apple:    165         (display-2, bold)
          kcal        (caption, muted)
```

- Macro targets: use `Heading` with `type="display-2"` for the number
- Body weight, calories remaining, workout volume: same treatment
- Use `Text` with `type="supporting"` for units and labels
- Use `hasTabularNumbers` on all numeric data so columns align

### 2. Generous Spacing — Let It Breathe
Apple uses whitespace to create focus. Content shouldn't feel cramped.

- Page padding: `contentPadding={5}` (20px) minimum, not 0
- Card padding: 5-6 for form-heavy cards, 4 for data cards
- Gap between sections: `gap={6}` (24px), not 16px
- Card spacing: `gap={4}` between cards, not stacked with margins
- Use `VStack gap={6}` between major page sections

### 3. Motion That Guides the Eye
Astryx provides motion tokens (`--duration-fast`, `--ease-standard`). Use them.

- **Page transitions**: Content should subtly fade/slide in (medium duration, 410ms)
- **Number changes**: When calorie count updates, animate the delta
- **Progress bars**: Smooth width transition (already done, ensure it uses Astryx tokens)
- **Card interactions**: Subtle elevation shift on hover for clickable cards
- **Modal/dialog**: Already animated by Astryx — ensure we use `purpose` correctly
- **Toasts**: Astryx handles entrance animation — just use `useToast()`

### 4. Color with Intent
- **Accent color**: Reserve for primary actions and key metrics only
- **Semantic colors**: Green for positive progress (protein hit), amber for warnings (approaching limit), red for over-target
- **Neutral surfaces**: Let the content pop against muted backgrounds
- **Dark mode**: Should feel premium, not just "inverted." Test both modes carefully.
- **Charts**: Use accent color sparingly. Multi-series charts should use 3-4 distinguishable, theme-consistent colors.

### 5. Focused Pages — One Thing Well
Each page should have a clear primary purpose:

| Page | Primary Purpose | Hero Element |
|------|----------------|--------------|
| Dashboard | "How am I doing today?" | Calorie ring / remaining number |
| Nutrition | "What did I eat?" | Macro progress + food log |
| Workout | "Lift weights and log it" | Active session interface |
| Progress | "Am I improving?" | Weight trend chart + volume analysis |
| Settings | "Configure my plan" | Profile form + goal selector |

### 6. Onboarding — First Run Experience
Apple apps guide first-time users. Ours shows empty data.

- **Dashboard (first visit)**: Instead of zeros, show a welcoming setup prompt: "Welcome to FitTrack. Let's set up your nutrition targets." with a CTA to settings.
- **Dashboard (after setup)**: Transition to showing real data with a brief "Here's your daily target" intro.
- **Settings**: Highlight the goal selector with a subtle visual emphasis (Card with variant, or Spotlight-like callout).

### 7. Information Density — Progressive Disclosure
- Dashboard: show the 3-4 most important numbers prominently. Everything else is secondary or in a detail view.
- Don't show raw "BMR: 1718 kcal" on the dashboard — show "TDEE: 2662 kcal" (the actionable number). BMR is in settings/expanding detail.
- Workout page: hide advanced metrics (volume, est. 1RM) behind expandable sections until the user wants them.

## Batches

### Batch 1: Dashboard Redesign — Calorie Ring + Hero Numbers
**Goal**: Make the dashboard instantly scannable and motivating.

- Replace calorie progress bar with a **circular progress ring** (SVG, using Astryx motion tokens) showing consumed vs. target
- Hero number: calories consumed (display-2 size), unit "of {target} kcal" in supporting text
- Macro mini-rings or compact bars beneath: Protein, Carbs, Fat
- Quick actions as prominent cards (not tiny links)
- "Remaining" calories shown prominently: "You have 1,200 kcal left"
- Use `VStack gap={6}` for section rhythm, `Card padding={6}` for breathing room
- Welcome state for first-time users (EmptyState with "Set up your targets" CTA)

### Batch 2: Nutrition Page — Meal-Based Layout
**Goal**: Make food logging feel like a natural meal-by-meal flow.

- Organize food log by meal type (Breakfast, Lunch, Dinner, Snack) as collapsible sections
- Each meal section shows subtotal calories/macros for that meal
- Quick-add button per meal section (pre-fills the meal type)
- Search results appear as a dropdown/popover, not pushing content down
- Macro summary as a sticky header that updates as you log
- Use `Collapsible` for meal sections, `Popover` for search results
- Use `MetadataList` for per-meal macro breakdowns

### Batch 3: Workout Page — Focused Session Interface
**Goal**: Make the active workout screen feel like a dedicated training tool.

- When a session is active, hide everything except the current exercise and set logging
- Large, touch-friendly inputs for weight/reps/RPE (optimized for gym use)
- Rest timer between sets (auto-suggest based on RPE: RPE 8-10 = 3 min, RPE 6-7 = 2 min)
- Previous session data shown contextually: "Last time: 100kg x 8"
- Exercise switching via horizontal swipe or SegmentedControl
- Volume and 1RM in a collapsible stats panel (not always visible)
- "Finish Workout" button prompts summary dialog with total volume, sets, duration

### Batch 4: Progress Page — Storytelling Charts
**Goal**: Make progress feel tangible and motivating.

- Weight chart: smooth area chart (not just a line) with gradient fill
- Show trend line (7-day moving average) in addition to raw data points
- Volume analysis: horizontal bars with smooth animation on load
- "Highlights" card: best lift this month, total volume, streak count
- Use `TabList` to switch between "Weight", "Volume", "Nutrition" views
- All charts use Astryx color tokens, never raw hex values

### Batch 5: Settings — Clean Form Experience
**Goal**: Make configuration feel like iOS Settings — calm and organized.

- Group settings into clear sections: Profile, Body Metrics, Goals, Data
- Use `Switch` for boolean settings (e.g., dark mode, notification preferences)
- Goal selector as `SelectableCard` grid (visual cards with descriptions)
- Activity level as `SegmentedControl` (5 options visible at once)
- Use `Divider` between sections
- Weight logging as a dedicated section with history mini-chart
- Data export/import in a "Data Management" section at the bottom

### Batch 6: Cross-Cutting Polish
**Goal**: The details that make it feel crafted.

- Page transitions: subtle fade using Astryx motion tokens
- Focus states: ensure all interactive elements have clear focus rings (Astryx inset shadows)
- Keyboard shortcuts: `/` to focus search, `n` for new entry, `?` for help
- Reduced motion: respect `prefers-reduced-motion` media query
- Dark mode: audit every page in dark mode, fix contrast issues
- Empty state illustrations: custom SVG icons for each empty state (not emoji)
- Consistent number formatting: always show same decimal precision for metrics

## Acceptance Criteria

- [ ] Dashboard has a calorie progress ring, not a flat bar
- [ ] Numbers use display-scale typography (heroes, not body text)
- [ ] All pages use generous spacing (gap 5-6 between sections)
- [ ] Nutrition page organizes by meal type
- [ ] Workout active session is focused and touch-friendly
- [ ] Progress page tells a story (trends, highlights, smooth charts)
- [ ] Settings feels organized (grouped sections, visual selectors)
- [ ] First-time users see a welcome flow, not empty zeros
- [ ] All transitions use Astryx motion tokens
- [ ] Dark mode is fully audited and premium-feeling
- [ ] No raw hex colors — only Astryx design tokens
- [ ] All unit tests pass
- [ ] All e2e tests pass
- [ ] Build succeeds
