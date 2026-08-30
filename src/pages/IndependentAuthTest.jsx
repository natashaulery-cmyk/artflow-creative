import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, LogOut } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { artflowAuthClient } from "@/lib/artflowAuthClient";

export default function IndependentAuthTest() {
  const { data: session, isPending, error } = artflowAuthClient.useSession();

  if (isPending) {
    return (
      <AuthLayout icon={Loader2} title="Checking your Art Flow account" subtitle="Verifying the new independent session">
        <div className="flex justify-center py-8"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      </AuthLayout>
    );
  }

  if (!session?.user) {
    return (
      <AuthLayout icon={CheckCircle2} title="Independent login" subtitle="Sign in with the new Art Flow account system">
        {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error.message}</div>}
        <Link to="/new-login"><Button className="w-full h-12">Go to new login</Button></Link>
      </AuthLayout>
    );
  }

  const signOut = async () => {
    await artflowAuthClient.signOut();
    window.location.replace("/new-login");
  };

  return (
    <AuthLayout icon={CheckCircle2} title="New Art Flow login works" subtitle="This session is stored in Neon, not Base44">
      <div className="rounded-xl border bg-card p-4 space-y-2 text-sm">
        <div><span className="text-muted-foreground">Name:</span> {session.user.name || "—"}</div>
        <div><span className="text-muted-foreground">Email:</span> {session.user.email}</div>
        <div><span className="text-muted-foreground">Status:</span> Signed in</div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground text-center leading-6">
        Your Base44 business data has now been migrated to Neon. Verify the linked data before this login becomes the main app login.
      </p>
      <Link to="/new-data-test"><Button type="button" className="w-full h-12 mt-5">Check migrated Neon data</Button></Link>
      <Button type="button" variant="outline" className="w-full h-12 mt-3" onClick={signOut}>
        <LogOut className="w-4 h-4 mr-2" />Sign out
      </Button>
    </AuthLayout>
  );
}
