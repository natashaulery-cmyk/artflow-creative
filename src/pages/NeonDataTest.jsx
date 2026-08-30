import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Database, Loader2, RefreshCw } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { artflowAuthClient } from "@/lib/artflowAuthClient";

export default function NeonDataTest() {
  const { data: session, isPending } = artflowAuthClient.useSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/neon-data?op=summary", { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not read Neon data");
      setData(body);
    } catch (e) {
      setError(e?.message || "Could not read Neon data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user) load();
  }, [session?.user?.id]);

  if (isPending) {
    return <AuthLayout icon={Loader2} title="Checking Neon data" subtitle="Verifying your independent Art Flow session"><div className="flex justify-center py-8"><Loader2 className="w-7 h-7 animate-spin" /></div></AuthLayout>;
  }

  if (!session?.user) {
    return <AuthLayout icon={Database} title="Neon data test" subtitle="Sign in with the new Art Flow account first"><Link to="/new-login"><Button className="w-full h-12">Go to new login</Button></Link></AuthLayout>;
  }

  return (
    <AuthLayout icon={Database} title="Neon data is connected" subtitle="Your migrated business data is being read through the new Art Flow login">
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      {loading && !data ? (
        <div className="flex justify-center py-8"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : data ? (
        <div className="space-y-4">
          <div className="rounded-xl border p-4 text-sm space-y-2">
            <div><span className="text-muted-foreground">Account linked:</span> {data.user?.legacyProfileLinked ? "Yes" : "No"}</div>
            <div><span className="text-muted-foreground">Businesses found:</span> {data.businesses?.length || 0}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-4 text-center"><div className="text-2xl font-semibold">{data.counts?.orders ?? 0}</div><div className="text-xs text-muted-foreground">Orders</div></div>
            <div className="rounded-xl border p-4 text-center"><div className="text-2xl font-semibold">{data.counts?.expenses ?? 0}</div><div className="text-xs text-muted-foreground">Expenses</div></div>
            <div className="rounded-xl border p-4 text-center"><div className="text-2xl font-semibold">{data.counts?.emailImports ?? 0}</div><div className="text-xs text-muted-foreground">Email imports</div></div>
            <div className="rounded-xl border p-4 text-center"><div className="text-2xl font-semibold">{data.counts?.syncStates ?? 0}</div><div className="text-xs text-muted-foreground">Sync states</div></div>
          </div>
          <Button type="button" variant="outline" className="w-full h-12" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}Refresh
          </Button>
          <Link to="/new-auth-test"><Button type="button" variant="ghost" className="w-full">Back to login test</Button></Link>
        </div>
      ) : null}
    </AuthLayout>
  );
}
