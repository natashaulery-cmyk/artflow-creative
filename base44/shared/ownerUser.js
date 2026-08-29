const lower = (value = '') => String(value || '').trim().toLowerCase();

export async function resolveBusinessWorkspace(base44, emailHint = '') {
  const users = await base44.asServiceRole.entities.User.list();
  const requestedEmail = lower(emailHint);

  let user = requestedEmail
    ? users.find((u) => lower(u.email) === requestedEmail)
    : await base44.auth.me().catch(() => null);

  if (!user || user.is_service) {
    user = users.find((u) => lower(u.email) === requestedEmail)
      || users.find((u) => u.role === 'admin')
      || users[0];
  }
  if (!user?.id) return { ownerId: null, businessId: null, email: requestedEmail || null };

  const email = lower(user.email || requestedEmail);
  const businesses = await base44.asServiceRole.entities.Business.list('name', 500);
  const activeId = user.active_business_id || user.data?.active_business_id || null;

  let business = businesses.find((b) => b.id === activeId);
  if (!business && email) {
    business = businesses.find((b) =>
      (b.sales_emails || []).some((member) => lower(member) === email)
      || (b.member_emails || []).some((member) => lower(member) === email)
    );
  }
  if (!business) business = businesses.find((b) => b.created_by_id === user.id);

  if (!business) {
    business = await base44.asServiceRole.entities.Business.create({
      name: user.business_name || user.data?.business_name || 'My Business',
      primary_email: user.email || emailHint || null,
      member_emails: user.email ? [user.email] : [],
      sales_emails: user.email ? [user.email] : [],
      created_by_id: user.id,
    });
  } else if (email && !(business.member_emails || []).some((member) => lower(member) === email)) {
    try {
      await base44.asServiceRole.entities.Business.update(business.id, {
        member_emails: Array.from(new Set([...(business.member_emails || []), user.email || emailHint])),
        primary_email: business.primary_email || user.email || emailHint,
      });
    } catch {}
  }

  const accessEmails = Array.from(new Set([
    ...(business?.member_emails || []),
    ...(business?.sales_emails || []),
    business?.primary_email,
    user.email,
  ].map(lower).filter(Boolean)));

  return {
    ownerId: user.id,
    businessId: business?.id || null,
    email: user.email || emailHint || null,
    accessEmails,
  };
}

export async function resolveOwnerUserId(base44, emailHint = '') {
  return (await resolveBusinessWorkspace(base44, emailHint)).ownerId;
}
