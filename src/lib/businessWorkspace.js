import { base44 } from "@/api/base44Client";

const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase();

export async function getCurrentBusinessWorkspace() {
  const me = await base44.auth.me();
  const email = normalizeEmail(me?.email);
  let businessId = me?.active_business_id || me?.data?.active_business_id || null;

  let business = null;
  try {
    const businesses = await base44.entities.Business.list("name", 100);
    business = businesses.find((b) => b.id === businessId)
      || businesses.find((b) =>
        (b.sales_emails || []).some((item) => normalizeEmail(item) === email)
        || (b.member_emails || []).some((item) => normalizeEmail(item) === email)
      )
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
    business?.primary_email,
    me?.email,
  ].map(normalizeEmail).filter(Boolean)));

  return { businessId, accessEmails, business };
}

export async function getCurrentBusinessId() {
  return (await getCurrentBusinessWorkspace()).businessId;
}
