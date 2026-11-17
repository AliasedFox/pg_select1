import { createApp } from "../src/app";

const server = createApp().listen(0);
const address = server.address();
if (address === null || typeof address === "string") {
  throw new Error("The test API isn't listening on a TCP port");
}
const { port } = address;

/** Sends a request to the API under test, the whole app as it runs in production, over HTTP. */
export function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://localhost:${port}${path}`, init);
}
