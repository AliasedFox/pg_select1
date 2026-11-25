// Runs before every web test file: a DOM, the fake API, and a clean slate after each test.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:5190" });

// happy-dom fires `selectionchange` each time the selection is set, at once, where browsers queue
// one for however many changes. The SQL editor (CodeMirror) reads the selection when it fires,
// which it can't while it's the one setting it, and sets it as it does, so each event would make
// more. They're queued here as a browser would, one at a time.
const dispatchEvent = document.dispatchEvent.bind(document);
let selectionChangeQueued = false;
document.dispatchEvent = (event) => {
  if (event.type !== "selectionchange") return dispatchEvent(event);
  if (!selectionChangeQueued) {
    selectionChangeQueued = true;
    setTimeout(() => {
      selectionChangeQueued = false;
      dispatchEvent(event);
    });
  }
  return true;
};

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
