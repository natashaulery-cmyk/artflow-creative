// Resolves the user id that workflow-triggered imports should attribute records
// to. In a connector-triggered workflow there is no incoming user request, so
// base44.auth.me() returns null; in that case we fall back to the workspace
// admin (the app owner) so created_by_id can be set explicitly for RLS.
export async function resolveOwnerUserId(base44) {
  const user = await base44.auth.me().catch(() => null);
  if (user?.id) return user.id;

  const users = await base44.asServiceRole.entities.User.list();
  const admin = users.find((u) => u.role === 'admin') || users[0];
  return admin?.id || null;
}