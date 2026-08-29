import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import AppleIcon from "@/components/AppleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", returnTo);
  };

  const handleApple = () => {
    base44.auth.loginWithProvider("apple", returnTo);
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <div className="space-y-3">
        <Button
          variant="outline"
          className="w-full h-12 text-sm font-medium"
          onClick={handleGoogle}
        >
          <GoogleIcon className="w-5 h-5 mr-2" />
          Continue with Google
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 text-sm font-medium"
          onClick={handleApple}
        >
          <AppleIcon className="w-5 h-5 mr-2" />
          Continue with Apple
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-5">
        <Link to="/terms-of-service" className="text-primary hover:underline">
          Terms of Service
        </Link>
        {" · "}
        <Link to="/privacy" className="text-primary hover:underline">
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