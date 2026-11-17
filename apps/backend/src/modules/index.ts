import type { Endpoint } from "../endpoint";
import { endpoints as health } from "./health/api";

/** Every module's endpoints, in the order they're mounted. */
export const endpoints: Endpoint[] = [...health];
