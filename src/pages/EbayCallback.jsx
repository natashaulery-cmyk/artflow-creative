import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function EbayCallback() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "working", message: "Finishing eBay connection…" });

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      if (error) {
        setState({ status: "error", message: params.get("error_description") || "eBay connection was not approved." });
        return;
      }
      const code = params.get("code") || "";
      const oauthState = params.get("state") || "";
      try {
        const res = await base44.functions.invoke("finishEbayOAuth", { code, state: oauthState });
        const data = res?.data || {};
        if (!data.connected) throw new Error(data.error || "Could not connect eBay.");

        const notificationRes = await base44.functions.invoke("setupEbayNotifications", {}).catch(() => null);
        const notificationData = notificationRes?.data || {};
        await base44.functions.invoke("syncEbay", {}).catch(() => null);
        setState({
          status: "done",
          message: notificationData.notifications_connected
            ? `${data.username || "Your eBay account"} is connected with live order notifications.`
            : `${data.username || "Your eBay account"} is connected. Live notifications may still need eBay approval/setup.`,
        });
        window.setTimeout(() => navigate("/account", { replace: true }), 1400);
      } catch (e) {
        setState({ status: "error", message: e?.response?.data?.error || e?.message || "Could not connect eBay." });
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
        <h1 className="font-heading text-xl">{state.status === "done" ? "eBay connected" : state.status === "error" ? "eBay connection problem" : "Connecting eBay"}</h1>
        <p className="text-sm text-muted-foreground mt-2">{state.message}</p>
        {state.status === "error" && (
          <button onClick={() => navigate("/account", { replace: true })} className="mt-5 w-full h-12 rounded-2xl bg-muted font-semibold">Back to Account</button>
        )}
      </div>
    </div>
  );
}
