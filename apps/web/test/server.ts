import { setupServer } from "msw/node";

import { handlers } from "./fixtures";

/** The fake API every web test runs against; a test can override a route with `server.use()`. */
export const server = setupServer(...handlers);
