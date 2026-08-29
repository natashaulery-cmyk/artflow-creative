import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import GoogleCalendarConnect from "@/components/GoogleCalendarConnect";
import BusinessManager from "@/components/BusinessManager";
import { toast } from "sonner";

export default function Account() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    base44.auth
      .me()
      .then((me) => {
        setUser(me);
      })
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    if (!user?.id) return;
    setDeleting(true);
    try {
      await base44.entities.User.delete(user.id);
      await base44.auth.logout();
    } catch (e) {
      toast.error("Could not delete account", { description: e.message });
      setDeleting(false);
    }
  };


  return (
    <div className="space-y-5">
      <PageHeader title="Account" subtitle="Profile & settings" onBack={() => navigate(-1)} />

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full pastel-lavender flex items-center justify-center font-heading text-lg text-[hsl(var(--primary))]">
            {(user?.full_name || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{user?.full_name || "Artist"}</p>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              Role: {user?.role || "user"}
            </p>
          </div>
        </div>
      </section>

      <BusinessManager />

      <GoogleCalendarConnect />

      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <h2 className="font-heading text-lg mb-1">Sign out</h2>
        <p className="text-sm text-muted-foreground mb-4">
          End your session on this device.
        </p>
        <button
          onClick={() => base44.auth.logout()}
          className="w-full h-12 rounded-2xl bg-muted text-foreground font-semibold active:scale-[0.98] transition-transform"
        >
          Log out
        </button>
      </section>

      <section className="bg-[hsl(var(--destructive))]/5 rounded-3xl p-5 border border-[hsl(var(--destructive))]/20">
        <h2 className="font-heading text-lg text-[hsl(var(--destructive))] flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Danger zone
        </h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <button
          onClick={() => setConfirmOpen(true)}
          className="w-full h-12 rounded-2xl bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <Trash2 className="w-4 h-4" /> Delete Account
        </button>
      </section>

      <AnimatePresence>
        {confirmOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !deleting && setConfirmOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 inset-x-0 z-50 max-w-md mx-auto bg-background rounded-t-[2rem] p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
            >
              <div className="w-12 h-1.5 rounded-full bg-[hsl(var(--border))] mx-auto mb-5" />
              <h3 className="font-heading text-2xl mb-2">Delete account?</h3>
              <p className="text-sm text-muted-foreground mb-5">
                This will permanently remove your account and business data. Type{" "}
                <span className="font-semibold text-foreground">DELETE</span> to confirm.
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={deleting}
                className="form-input mb-4"
              />
              <button
                onClick={handleDelete}
                disabled={deleting || confirmText !== "DELETE"}
                className="w-full h-14 rounded-2xl bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] font-semibold text-lg shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Confirm Delete"}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="w-full h-12 mt-2 rounded-2xl bg-muted text-foreground font-semibold active:scale-[0.98] transition-transform"
              >
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}