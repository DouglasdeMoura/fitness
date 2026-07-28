import { relations } from "drizzle-orm";

import {
  account,
  exercises,
  foods,
  mealPlans,
  mealTemplateItems,
  mealTemplates,
  programDays,
  programExercises,
  programs,
  session,
  user,
  workoutSessions,
  workoutSets,
} from "./schema";

export const workoutSessionsRelations = relations(
  workoutSessions,
  ({ many, one }) => ({
    program: one(programs, {
      fields: [workoutSessions.programId],
      references: [programs.id],
    }),
    programDay: one(programDays, {
      fields: [workoutSessions.programDayId],
      references: [programDays.id],
    }),
    sets: many(workoutSets),
  })
);

export const workoutSetsRelations = relations(workoutSets, ({ one }) => ({
  exercise: one(exercises, {
    fields: [workoutSets.exerciseId],
    references: [exercises.id],
  }),
  session: one(workoutSessions, {
    fields: [workoutSets.sessionId],
    references: [workoutSessions.id],
  }),
}));

export const programsRelations = relations(programs, ({ many }) => ({
  days: many(programDays),
}));

export const programDaysRelations = relations(programDays, ({ many, one }) => ({
  exercises: many(programExercises),
  program: one(programs, {
    fields: [programDays.programId],
    references: [programs.id],
  }),
}));

export const programExercisesRelations = relations(
  programExercises,
  ({ one }) => ({
    exercise: one(exercises, {
      fields: [programExercises.exerciseId],
      references: [exercises.id],
    }),
    programDay: one(programDays, {
      fields: [programExercises.programDayId],
      references: [programDays.id],
    }),
  })
);

export const mealTemplatesRelations = relations(mealTemplates, ({ many }) => ({
  items: many(mealTemplateItems),
  plans: many(mealPlans),
}));

export const mealTemplateItemsRelations = relations(
  mealTemplateItems,
  ({ one }) => ({
    food: one(foods, {
      fields: [mealTemplateItems.foodId],
      references: [foods.id],
    }),
    template: one(mealTemplates, {
      fields: [mealTemplateItems.templateId],
      references: [mealTemplates.id],
    }),
  })
);

export const mealPlansRelations = relations(mealPlans, ({ one }) => ({
  template: one(mealTemplates, {
    fields: [mealPlans.templateId],
    references: [mealTemplates.id],
  }),
}));
export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
