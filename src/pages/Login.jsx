import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { artflowAuthClient } from "@/lib/artflowAuthClient";

export default function Login() {
  const returnTo = safeReturnTo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Use the Base44-backed Art Flow session first because the live spreadsheet,
      // Gmail/Outlook, and business-workspace sync functions are currently tied
      // to that authenticated session. Neon stays available as a compatibility
      // fallback while the remaining server APIs are migrated.
      try {
        const { base44 } = await import("@/api/base44Client");
        await base44.auth.loginViaEmailPassword(email.trim(), password);
        window.location.href = returnTo;
        return;
      } catch (base44Error) {
        let neonError = null;
        try {
          const result = await artflowAuthClient.signIn.email({
            email: email.trim(),
            password,
            rememberMe: true,
          });
          neonError = result?.error || null;
          if (!neonError) {
            window.location.href = returnTo;
            return;
          }
        } catch (error) {
          neonError = error;
        }
        throw new Error(
          neonError?.message || base44Error?.message || "Email or password is incorrect."
        );
      }
    } catch (err) {
      setError(err?.message || "Could not sign in. Check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your Art Flow Creative account"
      footer={
        <>
          Use the email and password for your Art Flow account.
        </>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="login-password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing in…
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-5">
        <Link to="/terms-of-service" className="text-primary hover:underline">
          Terms of Service
        </Link>
        {" · "}
        <Link to="/privacy-policy" className="text-primary hover:underline">
          Privacy Policy
        </Link>
        {" · "}
        <Link to="/support" className="text-primary hover:underline">
          Support
        </Link>
      </p>
    </AuthLayout>
  );
}
