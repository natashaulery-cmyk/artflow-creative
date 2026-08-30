import { toNodeHandler } from "better-auth/node";
import { auth } from "./_auth.mjs";

export default toNodeHandler(auth);
