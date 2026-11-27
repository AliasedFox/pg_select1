import {
  type CreateDashboardRequest,
  type Dashboard,
  dashboard,
  dashboardList,
  type DashboardSummary,
  type UpdateDashboardRequest,
} from "@pg_select1/shared";

import { callApi, sendApi } from "@/lib/api";

/** Asks the API for the dashboards the signed-in user sees, by name. */
export async function fetchDashboards(): Promise<DashboardSummary[]> {
  const { dashboards } = await callApi("GET", "/api/dashboards", dashboardList);
  return dashboards;
}

/** Asks the API for one dashboard, with its queries in order. */
export function fetchDashboard(id: string): Promise<Dashboard> {
  return callApi("GET", `/api/dashboards/${id}`, dashboard);
}

/** Makes a dashboard. */
export function createDashboard(input: CreateDashboardRequest): Promise<Dashboard> {
  return callApi("POST", "/api/dashboards", dashboard, input);
}

/**
 * Changes a dashboard's title, description, who sees it or its queries, which `items` replaces
 * in the order given.
 */
export function updateDashboard(id: string, changes: UpdateDashboardRequest): Promise<Dashboard> {
  return callApi("PATCH", `/api/dashboards/${id}`, dashboard, changes);
}

/** Deletes a dashboard. Its saved queries stay. */
export async function deleteDashboard(id: string): Promise<void> {
  await sendApi("DELETE", `/api/dashboards/${id}`);
}

/** A dashboard's address in the app. */
export function dashboardPath(id: string): string {
  return `/dashboards/${id}`;
}
