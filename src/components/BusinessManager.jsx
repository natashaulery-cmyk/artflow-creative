import React, { useEffect, useMemo, useState } from "react";
import { Check, Link2, Pencil, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useEntity } from "@/lib/useBusinessData";
import { toast } from "sonner";

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

export default function BusinessManager() {
  const { records: businesses, loading, reload } = useEntity("Business", "name");
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const activeId = user?.active_business_id || user?.data?.active_business_id || null;
  const business = useMemo(() => {
    if (!businesses.length) return null;
    const email = normalizeEmail(user?.email);
    return (
      businesses.find((b) => b.id === activeId) ||
      businesses.find((b) => (b.member_emails || []).some((member) => normalizeEmail(member) === email)) ||
      null
    );
  }, [businesses, activeId, user?.email]);

  useEffect(() => {
    if (business) setName(business.name || "");
  }, [business?.id, business?.name]);

  const saveName = async () => {
    const next = name.trim();
    if (!business?.id || !next) return;
    setSaving(true);
    try {
      await base44.entities.Business.update(business.id, { name: next });
      await reload();
      setEditing(false);
      toast.success("Business workspace updated");
    } catch (e) {
      toast.error("Could not update business name");
    } finally {
      setSaving(false);
    }
  };

  const addLinkedEmail = async () => {
    const email = normalizeEmail(newEmail);
    if (!business?.id || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    const members = (business.member_emails || []).map(normalizeEmail).filter(Boolean);
    if (members.includes(email)) {
      setNewEmail("");
      toast.success("That email is already linked");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Business.update(business.id, {
        member_emails: Array.from(new Set([...members, email])),
      });
      setNewEmail("");
      await reload();
      toast.success("Google sign-in linked to this workspace");
    } catch (e) {
      toast.error("Could not link that email");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))]">
        <div className="h-5 w-40 rounded bg-muted animate-pulse mb-3" />
        <div className="h-16 rounded-2xl bg-muted animate-pulse" />
      </section>
    );
  }

  if (!business) return null;

  const members = Array.from(
    new Set([...(business.member_emails || []), user.email].map(normalizeEmail).filter(Boolean))
  );
  const salesEmails = Array.from(
    new Set([
      ...(business.sales_emails || []),
      business.primary_email,
    ].map(normalizeEmail).filter(Boolean))
  );
  const expenseEmails = Array.from(
    new Set([
      ...(business.expense_emails || []),
      ...(business.sales_emails || []),
      business.primary_email,
    ].map(normalizeEmail).filter(Boolean))
  );

  return (
    <section className="bg-card rounded-3xl p-5 border border-[hsl(var(--border))] space-y-5">
      <div>
        <h2 className="font-heading text-lg">Business workspace</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Orders, expenses, inventory, and totals stay with this workspace instead of a single login.
        </p>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Workspace name
            </p>
            {editing ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                className="form-input h-11"
              />
            ) : (
              <p className="font-heading text-xl truncate">{business.name}</p>
            )}
          </div>
          {editing ? (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={saveName}
                disabled={saving || !name.trim()}
                className="w-10 h-10 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center disabled:opacity-50"
                aria-label="Save business name"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setName(business.name || "");
                  setEditing(false);
                }}
                disabled={saving}
                className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"
                aria-label="Cancel edit"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0"
              aria-label="Edit business name"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4 text-[hsl(var(--primary))]" />
          <p className="text-sm font-semibold">Sales emails</p>
        </div>
        <div className="space-y-2">
          {salesEmails.map((email) => (
            <div key={email} className="rounded-2xl bg-muted px-4 py-3 text-sm">
              <p className="font-medium truncate">{email}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Marketplace sales from connected Gmail, Outlook, or Yahoo inboxes use this same business workspace.
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4 text-[hsl(var(--primary))]" />
          <p className="text-sm font-semibold">Expense emails</p>
        </div>
        <div className="space-y-2">
          {expenseEmails.map((email) => (
            <div key={email} className="rounded-2xl bg-muted px-4 py-3 text-sm">
              <p className="font-medium truncate">{email}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Receipts, invoices, supplies, software, equipment, shipping, and other qualifying business purchases can be pulled from these inboxes too.
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">Linked sign-ins</p>
        <div className="space-y-2 mb-3">
          {members.map((email) => (
            <div
              key={email}
              className="rounded-2xl border border-[hsl(var(--border))] px-4 py-3 flex items-center justify-between gap-2"
            >
              <span className="text-sm truncate">{email}</span>
              {salesEmails.includes(email) && (
                <span className="text-[10px] font-semibold uppercase text-muted-foreground shrink-0">
                  Sales email
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLinkedEmail()}
            placeholder="Link another sign-in email"
            inputMode="email"
            autoCapitalize="none"
            className="form-input flex-1"
          />
          <button
            onClick={addLinkedEmail}
            disabled={saving || !newEmail.trim()}
            className="w-14 h-14 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center shrink-0 disabled:opacity-50"
            aria-label="Link sign-in email"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Linked sign-ins see the same business data. Connected sales and expense inboxes are listed separately above.
        </p>
      </div>
    </section>
  );
}
