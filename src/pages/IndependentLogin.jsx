import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import AppleIcon from "@/components/AppleIcon";
import { artflowAuthClient } from "@/lib/artflowAuthClient";

export default function IndependentLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState("");
  const [error, setError] = useState("");
  const [providers, setProviders] = useState({ emailPassword: true, google: false, apple: false });

  useEffect(() => {
    fetch("/api/auth-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setProviders(data))
      .catch(() => {});
  }, []);

  const finish = () => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("returnTo") || "/new-auth-test";
    window.location.replace(next.startsWith("/") ? next : "/");
  };

  const handleEmail = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: signInError } = await artflowAuthClient.signIn.email({
        email: email.trim(),
        password,
        rememberMe: true,
      });
      if (signInError) throw new Error(signInError.message || "Email or password is incorrect.");
      finish();
    } catch (err) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider) => {
    if (!providers[provider]) {
      setError(`${provider === "google" ? "Google" : "Apple"} sign-in is being connected to Art Flow and is not active on this staging build yet.`);
      return;
    }
    setError("");
    setSocialLoading(provider);
    try {
      const { error: socialError } = await artflowAuthClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}/new-auth-test`,
      });
      if (socialError) throw new Error(socialError.message || `Could not sign in with ${provider}.`);
    } catch (err) {
      setError(err?.message || `Could not sign in with ${provider}.`);
      setSocialLoading("");
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Choose how you want to sign in to Art Flow Creative"
      footer={
        <>
          New to Art Flow?{" "}
          <Link to="/new-register" className="text-primary font-medium hover:underline">Create an account</Link>
        </>
      }
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      <div className="space-y-3 mb-5">
        <Button type="button" variant="outline" className="w-full h-12 font-medium" onClick={() => handleSocial("google")} disabled={Boolean(socialLoading)}>
          {socialLoading === "google" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GoogleIcon className="w-5 h-5 mr-2" />}
          Continue with Google
        </Button>
        <Button type="button" variant="outline" className="w-full h-12 font-medium" onClick={() => handleSocial("apple")} disabled={Boolean(socialLoading)}>
          {socialLoading === "apple" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AppleIcon className="w-5 h-5 mr-2" />}
          Continue with Apple
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="h-px bg-border flex-1" />
        <span className="text-xs text-muted-foreground">or use email and password</span>
        <div className="h-px bg-border flex-1" />
      </div>

      <form onSubmit={handleEmail} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="independent-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="independent-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="independent-password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="independent-password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12" minLength={8} required />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</> : "Log in"}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-5">
        One Art Flow account can use email, Google, and Apple when the email address matches.
      </p>
    </AuthLayout>
  );
}
