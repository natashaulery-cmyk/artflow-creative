import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function EtsyCallback() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "working", message: "Finishing Etsy connection…" });

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      if (error) {
        setState({ status: "error", message: params.get("error_description") || "Etsy connection was not approved." });
        return;
      }
      const code = params.get("code") || "";
      const oauthState = params.get("state") || "";
      try {
        const redirectUri = `${window.location.origin}/etsy/callback`;
        const res = await base44.functions.invoke("finishEtsyOAuth", { code, state: oauthState, redirect_uri: redirectUri });
        const data = res?.data || {};
        if (!data.connected) throw new Error(data.error || "Could not connect Etsy.");
        setState({ status: "done", message: `${data.shop_name || "Your Etsy shop"} is connected.` });
        window.setTimeout(() => navigate("/account", { replace: true }), 1200);
      } catch (e) {
        setState({ status: "error", message: e?.response?.data?.error || e?.message || "Could not connect Etsy." });
      }
    };
    run();
  }, [navigate]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-5">
      <div className="bg-card border border-[hsl(var(--border))] rounded-3xl p-7 w-full max-w-sm text-center">
        {state.status === "working" && <RefreshCw className="w-10 h-10 mx-auto mb-4 animate-spin text-[hsl(var(--primary))]" />}
        {state.status === "done" && <CheckCircle2 className="w-10 h-10 mx-auto mb-4 text-emerald-600" />}
        {state.status === "error" && <AlertCircle className="w-10 h-10 mx-auto mb-4 text-[hsl(var(--destructive))]" />}
        <h1 className="font-heading text-xl">{state.status === "done" ? "Etsy connected" : state.status === "error" ? "Etsy connection problem" : "Connecting Etsy"}</h1>
        <p className="text-sm text-muted-foreground mt-2">{state.message}</p>
        {state.status === "error" && (
          <button onClick={() => navigate("/account", { replace: true })} className="mt-5 w-full h-12 rounded-2xl bg-muted font-semibold">Back to Account</button>
        )}
      </div>
    </div>
  );
}