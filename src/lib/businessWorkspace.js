import { base44 } from "@/api/base44Client";

const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase();

export async function getCurrentBusinessWorkspace() {
  const me = await base44.auth.me();
  const email = normalizeEmail(me?.email);
  let businessId = me?.active_business_id || me?.data?.active_business_id || null;

  let business = null;
  try {
    const businesses = await base44.entities.Business.list("name", 100);
    // Email membership is the source of truth. Prefer the member workspace that
    // owns a spreadsheet so an older/stale active_business_id or duplicate
    // workspace cannot split the user's data.
    const emailBusinesses = businesses.filter((b) =>
      (b.sales_emails || []).some((item) => normalizeEmail(item) === email)
      || (b.expense_emails || []).some((item) => normalizeEmail(item) === email)
      || (b.member_emails || []).some((item) => normalizeEmail(item) === email)
      || normalizeEmail(b.primary_email) === email
    );
    business = emailBusinesses.find((b) => String(b.spreadsheet_id || '').trim())
      || emailBusinesses[0]
      || businesses.find((b) => b.id === businessId)
      || null;
  } catch {}

  if (business?.id) {
    businessId = business.id;
    if ((me?.active_business_id || me?.data?.active_business_id) !== businessId) {
      try {
        await base44.auth.updateMe({ active_business_id: businessId });
      } catch {}
    }
  }

  const accessEmails = Array.from(new Set([
    ...(business?.member_emails || []),
    ...(business?.sales_emails || []),
    ...(business?.expense_emails || []),
    business?.primary_email,
    me?.email,
  ].map(normalizeEmail).filter(Boolean)));

  return { businessId, accessEmails, business };
}

export async function getCurrentBusinessId() {
  return (await getCurrentBusinessWorkspace()).businessId;
}
