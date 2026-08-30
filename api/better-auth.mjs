import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth/_auth.mjs";

const nodeHandler = toNodeHandler(auth);

export default function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const authPath = url.searchParams.get("__path") || "";
    url.searchParams.delete("__path");
    req.url = `/api/auth/${authPath}${url.search}`;
  } catch {
    // Leave the URL unchanged; Better Auth will return a normal error response.
  }
  return nodeHandler(req, res);
}
