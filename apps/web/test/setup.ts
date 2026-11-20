// Runs before every web test file: a DOM, the fake API, and a clean slate after each test.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:5190" });

// Imported after the DOM exists, since Testing Library looks for `document` when it loads.
const { afterAll, afterEach, beforeAll } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");
const { server } = await import("./server");

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
