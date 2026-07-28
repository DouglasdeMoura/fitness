import {
  getConsistency,
  getDashboardStats,
  getWeeklyReviewAvailability,
} from "~/lib/api";
import { parseSearchDate, resolveSelectedDate } from "~/lib/nutrition";

export interface DashboardSearch {
  date?: string;
}

export function parseDashboardSearch(
  search: Record<string, unknown>
): DashboardSearch {
  return {
    date: parseSearchDate(
      typeof search.date === "string" ? search.date : undefined
    ),
  };
}

export function dashboardLoaderDeps(search: DashboardSearch): DashboardSearch {
  return { date: search.date };
}

/** Shared dashboard loader for `/` and `/dashboard` (issue #43). */
export async function loadDashboardRouteData(deps: DashboardSearch) {
  const asOf = resolveSelectedDate(deps.date);
  const [stats, consistency, weeklyReview] = await Promise.all([
    getDashboardStats(),
    getConsistency({ data: { asOf } }),
    getWeeklyReviewAvailability({ data: { asOf } }),
  ]);
  return { asOf, consistency, stats, weeklyReview };
}
