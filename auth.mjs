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
const baseURL = process.env.BETTER_AUTH_URL || (process.env.VERCEL_ENV === "production"
  ? canonicalProductionURL
  : vercelDeploymentURL || vercelProductionURL || canonicalProductionURL);

const socialProviders = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

if (
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_CLIENT_SECRET
) {
  socialProviders.apple = {
    clientId: process.env.APPLE_CLIENT_ID,
    clientSecret: process.env.APPLE_CLIENT_SECRET,
  };
}

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
      trustedProviders: ["google", "apple", "email-password"],
      allowDifferentEmails: false,
    },
  },
  socialProviders,
  trustedOrigins: [
    baseURL,
    vercelProductionURL,
    vercelDeploymentURL,
    "https://affordable-art-co-dashboard.vercel.app",
    "https://affordable-art-co-dashboard-art-fed4.vercel.app",
    "https://artflowcreativeapp.com",
    "https://www.artflowcreativeapp.com",
    "https://appleid.apple.com",
  ].filter(Boolean),
});

export default auth;
