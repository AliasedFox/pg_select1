import type { Endpoint } from "../endpoint";
import { endpoints as connection } from "./connection/api";
import { endpoints as explore } from "./explore/api";
import { endpoints as health } from "./health/api";
import { endpoints as user } from "./user/api";

/** Every module's endpoints, in the order they're mounted. */
export const endpoints: Endpoint[] = [...health, ...user, ...connection, ...explore];
