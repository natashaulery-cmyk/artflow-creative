import { createAuthClient } from "better-auth/react";

export const artflowAuthClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
});
