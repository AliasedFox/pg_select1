import type { Resource } from "./resources";

/** Shows a page about pg_select1: only its title for now, until it's written. */
export function ResourcePage({ resource }: { resource: Resource }) {
  return <h1 className="text-lg font-semibold">{resource.label}</h1>;
}
