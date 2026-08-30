import { auth } from "./_auth.mjs";

export function GET(request) {
  return auth.handler(request);
}

export function POST(request) {
  return auth.handler(request);
}
