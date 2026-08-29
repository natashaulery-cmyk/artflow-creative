import { base44 } from "@/api/base44Client";

export async function getCurrentBusinessId() {
  const me = await base44.auth.me();
  return me?.active_business_id || me?.data?.active_business_id || null;
}
