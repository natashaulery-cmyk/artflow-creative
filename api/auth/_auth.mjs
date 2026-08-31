import { betterAuth } from "better-auth";
import pg from "pg";

const { Pool } = pg;

const vercelProductionURL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "";
const vercelDeploymentURL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "";
const canonicalProductionURL = "https://artflowcreativeapp.com";
const baseURL = process.env.BETTER_AUTH_URL || (
  process.env.VERCEL_ENV === "production"
    ? canonicalProductionURL
    : vercelDeploymentURL || vercelProductionURL || canonicalProductionURL
);

export const auth = betterAuth({
  appName: "Art Flow Creative",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["email-password"],
      allowDifferentEmails: false,
    },
  },
  socialProviders: {},
  trustedOrigins: [
    baseURL,
    vercelProductionURL,
    vercelDeploymentURL,
    "https://artflowcreativeapp.com",
    "https://www.artflowcreativeapp.com",
  ].filter(Boolean),
});

export default auth;
