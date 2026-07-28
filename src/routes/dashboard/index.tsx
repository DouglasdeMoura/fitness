import { createFileRoute } from "@tanstack/react-router";

import { DashboardSkeleton } from "~/components/loading/page-skeletons";
import {
  dashboardLoaderDeps,
  loadDashboardRouteData,
  parseDashboardSearch,
} from "~/lib/dashboard-route";

import { DashboardPage } from "../index";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard - FitTrack" }] }),
  loader: async ({ deps }) => loadDashboardRouteData(dashboardLoaderDeps(deps)),
  loaderDeps: ({ search }) => parseDashboardSearch(search),
  pendingComponent: DashboardSkeleton,
  validateSearch: parseDashboardSearch,
});
