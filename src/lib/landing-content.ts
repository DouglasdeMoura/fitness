/** Marketing copy and navigation targets for the public landing page (issue #45). */

export const LANDING_HERO_HEADLINE =
  "Train smarter. Eat better. Backed by science." as const;

export const LANDING_HERO_SUBHEADLINE =
  "The only fitness tracker where every number has a citation." as const;

export const LANDING_PRIMARY_CTA = {
  href: "/sign-up",
  label: "Get Started Free",
} as const;

export const LANDING_SECONDARY_CTA = {
  href: "/blog",
  label: "See the science",
} as const;

export const LANDING_FINAL_CTA = {
  buttonLabel: "Create your free account",
  headline: "Start your evidence-based fitness journey today",
  href: "/sign-up",
} as const;

export interface LandingFeatureCard {
  description: string;
  emoji: string;
  href: string;
  id: string;
  title: string;
}

/** Feature highlights shown as clickable cards (PRD 08 Part 1). */
export const LANDING_FEATURE_CARDS: readonly LandingFeatureCard[] = [
  {
    description:
      "Macro targets derived from Mifflin-St Jeor BMR and goal-specific protein guidance.",
    emoji: "🥗",
    href: "/blog/macros-101",
    id: "nutrition",
    title: "Nutrition tracking with evidence-based macro targets",
  },
  {
    description:
      "Track sets, reps, and RPE so volume trends reflect real training stimulus.",
    emoji: "🏋️",
    href: "/blog/progressive-overload-guide",
    id: "workout",
    title: "Workout logging with progressive overload analysis",
  },
  {
    description:
      "Rolling averages and consistency scores built from your logged workouts and meals.",
    emoji: "📊",
    href: "/sign-up",
    id: "progress",
    title: "Progress charts with real trend data, not vanity metrics",
  },
  {
    description:
      "BMR, protein targets, and volume guidance link back to peer-reviewed research.",
    emoji: "🔬",
    href: "/blog/mifflin-st-jeor-bmr",
    id: "formulas",
    title: "Every formula cited — Mifflin-St Jeor, Morton, Schoenfeld",
  },
] as const;

/** Morton et al. 2018 meta-analysis on protein and hypertrophy (Br J Sports Med). */
export const LANDING_SCIENCE_BLOCKQUOTE = {
  cite: "Morton et al., British Journal of Sports Medicine, 2018",
  quote:
    "Dietary protein supplementation significantly enhanced changes in muscle strength and size during prolonged resistance exercise training in healthy adults.",
} as const;

export const LANDING_SCIENCE_EXPLAINER =
  "FitTrack calculates your resting metabolic rate with the Mifflin-St Jeor equation, sets protein from Morton and Helms dose-response research, and tracks training volume using Schoenfeld's hypertrophy guidelines — every number links to the study behind it." as const;

export const LANDING_BLOG_LINKS = [
  {
    href: "/blog/protein-for-hypertrophy",
    label: "How much protein do you need?",
  },
  {
    href: "/blog/mifflin-st-jeor-bmr",
    label: "Why we use Mifflin-St Jeor for BMR",
  },
  {
    href: "/blog/training-volume",
    label: "Schoenfeld's volume dose-response",
  },
] as const;
