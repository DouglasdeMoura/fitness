import "./load-env.ts";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { and, eq } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import {
  exercises as exercisesTable,
  foods as foodsTable,
  programDays,
  programExercises,
  programs,
} from "../src/db/schema.ts";
import {
  assertSeedDemoPasswordForProduction,
  ensureSeedDemoAccount,
} from "../src/lib/seed-auth.ts";

assertSeedDemoPasswordForProduction();

const dbPath =
  process.env.DATABASE_PATH ?? join(process.cwd(), "data", "fittrack.db");
mkdirSync(dirname(dbPath), { recursive: true });

// Seed foods
const foods = [
  // Proteins
  ["Chicken Breast (raw)", null, 100, "g", 165, 31, 0, 3.6, 0, 0, 74],
  ["Chicken Thigh (raw)", null, 100, "g", 209, 26, 0, 11, 0, 0, 87],
  ["Lean Ground Beef 93/7 (raw)", null, 100, "g", 176, 25, 0, 8, 0, 0, 70],
  ["Ground Beef 80/20 (raw)", null, 100, "g", 254, 17, 0, 20, 0, 0, 74],
  ["Steak (Sirloin, raw)", null, 100, "g", 217, 26, 0, 12, 0, 0, 57],
  ["Salmon (Atlantic, raw)", null, 100, "g", 208, 20, 0, 13, 0, 0, 59],
  ["Tuna (canned in water)", null, 100, "g", 116, 26, 0, 1, 0, 0, 247],
  ["Egg (whole, large)", null, 50, "g", 78, 6.3, 0.4, 5.3, 0, 0, 62],
  ["Egg White", null, 100, "g", 52, 11, 0.7, 0.2, 0, 0, 166],
  ["Greek Yogurt (non-fat)", null, 170, "g", 100, 17, 6, 0.7, 0, 6, 87],
  ["Cottage Cheese (low-fat)", null, 100, "g", 72, 11, 3.4, 1.2, 0, 3.4, 308],
  ["Whey Protein Isolate", null, 30, "g", 120, 25, 2, 1, 0, 2, 50],
  ["Tofu (firm)", null, 100, "g", 144, 17, 3, 9, 2.3, 1, 14],
  ["Tempeh", null, 100, "g", 192, 20, 8, 11, 9, 0, 9],
  ["Shrimp (cooked)", null, 100, "g", 99, 24, 0.2, 0.3, 0, 0, 111],
  ["Pork Tenderloin (raw)", null, 100, "g", 143, 26, 0, 3.5, 0, 0, 63],
  ["Turkey Breast (raw)", null, 100, "g", 135, 30, 0, 1, 0, 0, 76],

  // Carbs
  ["White Rice (cooked)", null, 100, "g", 130, 2.7, 28, 0.3, 0.4, 0, 1],
  ["Brown Rice (cooked)", null, 100, "g", 112, 2.6, 24, 0.9, 1.8, 0.4, 5],
  ["Basmati Rice (cooked)", null, 100, "g", 121, 3, 25, 0.4, 1, 0, 4],
  ["Oats (dry)", null, 40, "g", 156, 6.8, 27, 2.8, 4, 0.5, 2],
  ["Sweet Potato (baked)", null, 100, "g", 90, 2, 21, 0.1, 3.3, 6, 36],
  ["Potato (baked)", null, 100, "g", 93, 2.5, 21, 0.1, 2.2, 1, 10],
  ["Whole Wheat Bread", null, 28, "g", 81, 4, 14, 1.1, 1.9, 2, 132],
  ["White Bread", null, 28, "g", 75, 2.6, 14, 1, 0.8, 1.5, 133],
  ["Pasta (cooked)", null, 100, "g", 131, 5, 25, 1.1, 1.8, 0.7, 6],
  ["Quinoa (cooked)", null, 100, "g", 120, 4.4, 21, 1.9, 2.8, 0.9, 7],
  ["Banana", null, 118, "g", 105, 1.3, 27, 0.4, 3.1, 14, 1],
  ["Apple", null, 182, "g", 95, 0.5, 25, 0.3, 4.4, 19, 2],
  ["Blueberries", null, 100, "g", 57, 0.7, 14, 0.3, 2.4, 10, 1],
  ["Tortilla (flour, large)", null, 49, "g", 145, 4, 24, 3.5, 1.4, 1, 393],

  // Fats
  ["Olive Oil", null, 14, "g", 120, 0, 0, 14, 0, 0, 0],
  ["Avocado", null, 100, "g", 160, 2, 9, 15, 7, 1, 7],
  ["Almonds", null, 28, "g", 164, 6, 6, 14, 3.5, 1, 0],
  ["Walnuts", null, 28, "g", 185, 4.3, 3.9, 18, 1.9, 0.7, 1],
  ["Peanut Butter", null, 32, "g", 188, 8, 6, 16, 1.8, 3, 152],
  ["Almond Butter", null, 32, "g", 196, 7, 6, 18, 3, 1, 125],
  ["Coconut Oil", null, 14, "g", 121, 0, 0, 13, 0, 0, 0],
  ["Butter", null, 14, "g", 102, 0.1, 0, 12, 0, 0, 91],
  ["Cheddar Cheese", null, 28, "g", 113, 7, 0.4, 9, 0, 0, 174],
  ["Chia Seeds", null, 28, "g", 138, 5, 12, 9, 10, 0, 5],

  // Vegetables
  ["Broccoli (steamed)", null, 100, "g", 35, 2.4, 7, 0.4, 3.3, 2, 41],
  ["Spinach (raw)", null, 100, "g", 23, 2.9, 3.6, 0.4, 2.2, 0.4, 79],
  ["Carrots (raw)", null, 100, "g", 41, 0.9, 10, 0.2, 2.8, 4.7, 69],
  ["Bell Pepper (raw)", null, 100, "g", 31, 1, 6, 0.3, 2.1, 4.2, 4],
  ["Onion (raw)", null, 100, "g", 40, 1.1, 9, 0.1, 1.7, 4.2, 4],
  ["Asparagus (cooked)", null, 100, "g", 20, 2.2, 4, 0.2, 1.8, 1.3, 2],
  ["Mushrooms (raw)", null, 100, "g", 22, 3.1, 3.3, 0.3, 1, 2, 5],

  // Dairy & Other
  ["Milk (whole)", null, 244, "g", 149, 8, 12, 8, 0, 12, 105],
  ["Milk (2%)", null, 244, "g", 122, 8, 12, 5, 0, 12, 115],
  ["Milk (skim)", null, 244, "g", 83, 8, 12, 0.2, 0, 12, 103],
  ["Black Coffee", null, 240, "ml", 2, 0.3, 0, 0, 0, 0, 5],
  ["Honey", null, 21, "g", 64, 0.1, 17, 0, 0, 17, 3],
  ["Maple Syrup", null, 20, "g", 52, 0, 13, 0, 0, 12, 2],
  ["Dark Chocolate 70%", null, 28, "g", 155, 2, 13, 12, 3, 7, 4],
];

for (const f of foods as [
  string,
  string | null,
  number,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
][]) {
  db.insert(foodsTable)
    .values({
      brand: f[1],
      caloriesPerServing: f[4],
      carbsG: f[6],
      fatG: f[7],
      fiberG: f[8],
      name: f[0],
      proteinG: f[5],
      servingSize: f[2],
      servingUnit: f[3],
      sodiumMg: f[10],
      source: "seed",
      sugarG: f[9],
    })
    .onConflictDoNothing()
    .run();
}

// Seed exercises
const exercises = [
  // Compound - Chest
  [
    "Barbell Bench Press",
    "compound",
    "chest",
    "Barbell",
    "Lie on a flat bench, lower the bar to mid-chest, press up to full lockout. Keep shoulder blades retracted.",
  ],
  [
    "Incline Dumbbell Press",
    "compound",
    "chest",
    "Dumbbells",
    "On an incline bench (30-45 degrees), press dumbbells from chest to overhead.",
  ],
  [
    "Push-up",
    "bodyweight",
    "chest",
    null,
    "Hands slightly wider than shoulders, lower chest to floor, push back up.",
  ],
  [
    "Dumbbell Fly",
    "isolation",
    "chest",
    "Dumbbells",
    "Lie flat, arms slightly bent, lower dumbbells in wide arc, squeeze chest to return.",
  ],

  // Compound - Back
  [
    "Deadlift",
    "compound",
    "back",
    "Barbell",
    "Stand with feet hip-width, grip bar, drive through heels, extend hips and knees simultaneously.",
  ],
  [
    "Pull-up",
    "bodyweight",
    "back",
    "Pull-up Bar",
    "Hang from bar, pull chest to bar, lower with control.",
  ],
  [
    "Bent-Over Barbell Row",
    "compound",
    "back",
    "Barbell",
    "Hinge at hips, pull bar to lower chest, squeeze shoulder blades.",
  ],
  [
    "Lat Pulldown",
    "compound",
    "back",
    "Cable Machine",
    "Pull bar to upper chest, control the negative.",
  ],
  [
    "Seated Cable Row",
    "compound",
    "back",
    "Cable Machine",
    "Pull handle to abdomen, squeeze lats, return with control.",
  ],

  // Compound - Legs
  [
    "Barbell Back Squat",
    "compound",
    "legs",
    "Barbell",
    "Bar on upper traps, descend to parallel or below, drive up through midfoot.",
  ],
  [
    "Front Squat",
    "compound",
    "legs",
    "Barbell",
    "Bar on front delts, maintain upright torso, squat deep.",
  ],
  [
    "Romanian Deadlift",
    "compound",
    "legs",
    "Barbell",
    "Hinge at hips with slight knee bend, lower bar along legs, feel hamstring stretch.",
  ],
  [
    "Bulgarian Split Squat",
    "compound",
    "legs",
    "Dumbbells",
    "Rear foot elevated, descend until front thigh parallel, drive up.",
  ],
  [
    "Walking Lunge",
    "compound",
    "legs",
    "Dumbbells",
    "Step forward, lower back knee toward floor, push through front heel.",
  ],
  [
    "Leg Press",
    "compound",
    "legs",
    "Machine",
    "Feet shoulder-width on platform, lower to 90 degrees, press through heels.",
  ],
  [
    "Calf Raise",
    "isolation",
    "legs",
    null,
    "Rise onto balls of feet, pause at top, lower slowly.",
  ],

  // Compound - Shoulders
  [
    "Standing Overhead Press",
    "compound",
    "shoulders",
    "Barbell",
    "Press bar from shoulders to overhead, brace core, no leg drive.",
  ],
  [
    "Seated Dumbbell Shoulder Press",
    "compound",
    "shoulders",
    "Dumbbells",
    "Sit with back support, press dumbbells from shoulders to overhead.",
  ],
  [
    "Lateral Raise",
    "isolation",
    "shoulders",
    "Dumbbells",
    "Raise dumbbells to shoulder height with slight forward lean, lower slowly.",
  ],
  [
    "Face Pull",
    "isolation",
    "shoulders",
    "Cable Machine",
    "Pull rope to forehead, external rotation, squeeze rear delts.",
  ],

  // Arms
  [
    "Barbell Curl",
    "isolation",
    "arms",
    "Barbell",
    "Curl bar from full extension to shoulders, no swinging.",
  ],
  [
    "Dumbbell Hammer Curl",
    "isolation",
    "arms",
    "Dumbbells",
    "Neutral grip curl, keep elbows fixed.",
  ],
  [
    "Triceps Pushdown",
    "isolation",
    "arms",
    "Cable Machine",
    "Push bar down with elbows pinned to sides, full extension.",
  ],
  [
    "Close-Grip Bench Press",
    "compound",
    "arms",
    "Barbell",
    "Narrow grip, elbows tucked, targets triceps.",
  ],
  [
    "Overhead Triceps Extension",
    "isolation",
    "arms",
    "Dumbbell",
    "Lower weight behind head, extend to lockout.",
  ],

  // Core
  [
    "Plank",
    "bodyweight",
    "core",
    null,
    "Forearms on ground, body straight, hold position. Brace abs.",
  ],
  [
    "Hanging Leg Raise",
    "bodyweight",
    "core",
    "Pull-up Bar",
    "Hang from bar, raise legs to parallel or higher, lower with control.",
  ],
  [
    "Cable Crunch",
    "isolation",
    "core",
    "Cable Machine",
    "Kneel, crunch rope down, flex spine.",
  ],
  [
    "Ab Wheel Rollout",
    "bodyweight",
    "core",
    "Ab Wheel",
    "Kneel, roll wheel forward, maintain neutral spine, return.",
  ],

  // Cardio / Full Body
  [
    "Kettlebell Swing",
    "compound",
    "full_body",
    "Kettlebell",
    "Hinge at hips, swing bell to chest height using hip drive, not arms.",
  ],
  [
    "Burpee",
    "bodyweight",
    "full_body",
    null,
    "Squat, kick to plank, push-up, jump feet in, stand and jump.",
  ],
  [
    "Box Jump",
    "compound",
    "legs",
    "Plyo Box",
    "Jump onto box, land soft, step down.",
  ],
  [
    "Farmer Carry",
    "compound",
    "full_body",
    "Dumbbells",
    "Hold heavy weights, walk with upright posture, core braced.",
  ],
];

for (const e of exercises as [
  string,
  "compound" | "isolation" | "bodyweight" | "cardio" | "mobility",
  string,
  string | null,
  string | null,
][]) {
  db.insert(exercisesTable)
    .values({
      category: e[1],
      equipment: e[3],
      instructions: e[4],
      muscleGroup: e[2],
      name: e[0],
    })
    .onConflictDoNothing()
    .run();
}

// Seed training programs for the deterministic demo profile (issue #82)
const { profileUserId: athleteId } = await ensureSeedDemoAccount(db);
const exerciseIds = Object.fromEntries(
  db
    .select({ id: exercisesTable.id, name: exercisesTable.name })
    .from(exercisesTable)
    .all()
    .map((row) => [row.name, row.id])
);

function seedProgram(
  program: {
    name: string;
    description: string;
    frequency_per_week: number;
    periodization_type: "linear" | "dup";
    progression_increment_pct: number;
    is_active: number;
  },
  days: {
    day_name: string;
    sort_order: number;
    exercises: {
      name: string;
      target_sets: number;
      target_reps: string;
      target_rpe: number;
      rest_seconds: number;
      sort_order: number;
    }[];
  }[]
) {
  const existing = db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, athleteId), eq(programs.name, program.name)))
    .get();
  if (existing) {
    return existing.id;
  }

  const programId = db
    .insert(programs)
    .values({
      description: program.description,
      frequencyPerWeek: program.frequency_per_week,
      isActive: program.is_active,
      name: program.name,
      periodizationType: program.periodization_type,
      progressionIncrementPct: program.progression_increment_pct,
      userId: athleteId,
    })
    .returning({ id: programs.id })
    .get().id;

  for (const day of days) {
    const dayId = db
      .insert(programDays)
      .values({
        dayName: day.day_name,
        programId,
        sortOrder: day.sort_order,
      })
      .returning({ id: programDays.id })
      .get().id;
    for (const exercise of day.exercises) {
      db.insert(programExercises)
        .values({
          exerciseId: exerciseIds[exercise.name],
          programDayId: dayId,
          restSeconds: exercise.rest_seconds,
          sortOrder: exercise.sort_order,
          targetReps: exercise.target_reps,
          targetRpe: exercise.target_rpe,
          targetSets: exercise.target_sets,
        })
        .run();
    }
  }
  return programId;
}

const linearProgramId = seedProgram(
  {
    description:
      "4-day upper/lower split with steady load progression when RPE allows.",
    frequency_per_week: 4,
    is_active: 1,
    name: "Upper/Lower Linear",
    periodization_type: "linear",
    progression_increment_pct: 2.5,
  },
  [
    {
      day_name: "Upper A",
      exercises: [
        {
          name: "Barbell Bench Press",
          rest_seconds: 120,
          sort_order: 1,
          target_reps: "6-8",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Bent-Over Barbell Row",
          rest_seconds: 120,
          sort_order: 2,
          target_reps: "6-8",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Standing Overhead Press",
          rest_seconds: 90,
          sort_order: 3,
          target_reps: "8-10",
          target_rpe: 8,
          target_sets: 3,
        },
        {
          name: "Lat Pulldown",
          rest_seconds: 90,
          sort_order: 4,
          target_reps: "10-12",
          target_rpe: 8,
          target_sets: 3,
        },
      ],
      sort_order: 1,
    },
    {
      day_name: "Lower A",
      exercises: [
        {
          name: "Barbell Back Squat",
          rest_seconds: 150,
          sort_order: 1,
          target_reps: "6-8",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Romanian Deadlift",
          rest_seconds: 120,
          sort_order: 2,
          target_reps: "8-10",
          target_rpe: 8,
          target_sets: 3,
        },
        {
          name: "Walking Lunge",
          rest_seconds: 90,
          sort_order: 3,
          target_reps: "10-12",
          target_rpe: 8,
          target_sets: 3,
        },
      ],
      sort_order: 2,
    },
    {
      day_name: "Upper B",
      exercises: [
        {
          name: "Incline Dumbbell Press",
          rest_seconds: 90,
          sort_order: 1,
          target_reps: "8-10",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Seated Cable Row",
          rest_seconds: 90,
          sort_order: 2,
          target_reps: "8-10",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Lateral Raise",
          rest_seconds: 60,
          sort_order: 3,
          target_reps: "12-15",
          target_rpe: 8,
          target_sets: 3,
        },
        {
          name: "Barbell Curl",
          rest_seconds: 60,
          sort_order: 4,
          target_reps: "10-12",
          target_rpe: 8,
          target_sets: 3,
        },
      ],
      sort_order: 3,
    },
    {
      day_name: "Lower B",
      exercises: [
        {
          name: "Front Squat",
          rest_seconds: 150,
          sort_order: 1,
          target_reps: "6-8",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Leg Press",
          rest_seconds: 120,
          sort_order: 2,
          target_reps: "10-12",
          target_rpe: 8,
          target_sets: 3,
        },
        {
          name: "Calf Raise",
          rest_seconds: 60,
          sort_order: 3,
          target_reps: "12-15",
          target_rpe: 8,
          target_sets: 4,
        },
      ],
      sort_order: 4,
    },
  ]
);

const dupProgramId = seedProgram(
  {
    description:
      "3-day full body with daily rep zone rotation (strength, hypertrophy, endurance).",
    frequency_per_week: 3,
    is_active: 0,
    name: "Full Body DUP",
    periodization_type: "dup",
    progression_increment_pct: 2.5,
  },
  [
    {
      day_name: "Strength",
      exercises: [
        {
          name: "Barbell Back Squat",
          rest_seconds: 180,
          sort_order: 1,
          target_reps: "3-5",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Barbell Bench Press",
          rest_seconds: 180,
          sort_order: 2,
          target_reps: "3-5",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Bent-Over Barbell Row",
          rest_seconds: 150,
          sort_order: 3,
          target_reps: "4-6",
          target_rpe: 8,
          target_sets: 3,
        },
      ],
      sort_order: 1,
    },
    {
      day_name: "Hypertrophy",
      exercises: [
        {
          name: "Front Squat",
          rest_seconds: 120,
          sort_order: 1,
          target_reps: "8-10",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Incline Dumbbell Press",
          rest_seconds: 90,
          sort_order: 2,
          target_reps: "8-12",
          target_rpe: 8,
          target_sets: 4,
        },
        {
          name: "Lat Pulldown",
          rest_seconds: 90,
          sort_order: 3,
          target_reps: "10-12",
          target_rpe: 8,
          target_sets: 3,
        },
        {
          name: "Romanian Deadlift",
          rest_seconds: 120,
          sort_order: 4,
          target_reps: "8-10",
          target_rpe: 8,
          target_sets: 3,
        },
      ],
      sort_order: 2,
    },
    {
      day_name: "Endurance",
      exercises: [
        {
          name: "Leg Press",
          rest_seconds: 75,
          sort_order: 1,
          target_reps: "12-15",
          target_rpe: 7,
          target_sets: 3,
        },
        {
          name: "Push-up",
          rest_seconds: 60,
          sort_order: 2,
          target_reps: "12-20",
          target_rpe: 7,
          target_sets: 3,
        },
        {
          name: "Seated Cable Row",
          rest_seconds: 75,
          sort_order: 3,
          target_reps: "12-15",
          target_rpe: 7,
          target_sets: 3,
        },
        {
          name: "Dumbbell Hammer Curl",
          rest_seconds: 60,
          sort_order: 4,
          target_reps: "12-15",
          target_rpe: 7,
          target_sets: 3,
        },
      ],
      sort_order: 3,
    },
  ]
);

console.log(
  `Seeded training programs: linear #${linearProgramId}, dup #${dupProgramId}`
);

console.log(`Seeded ${foods.length} foods and ${exercises.length} exercises.`);
console.log(`Demo account profile user id: ${athleteId}`);
