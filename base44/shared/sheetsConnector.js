// Shared Google Sheets connector id (app-user mode). Each signed-up user
// connects their own Google account via this connector; backend functions
// resolve the current user's token with getCurrentAppUserConnection(this id).
export const GOOGLE_SHEETS_CONNECTOR_ID = "6a91de0eec67a1e703268441";

export async function getGoogleSheetsAccessToken(base44) {
  try {
    const connection = await base44.asServiceRole.connectors.getCurrentAppUserConnection(
      GOOGLE_SHEETS_CONNECTOR_ID
    );
    if (connection?.accessToken) return connection.accessToken;
  } catch {}

  // Keep the owner's existing hosted connection working while every future
  // account can still connect its own Google Sheets account.
  try {
    const connection = await base44.asServiceRole.connectors.getConnection('googlesheets');
    if (connection?.accessToken) return connection.accessToken;
  } catch {}

  throw new Error('Google Sheets is not connected for this user.');
}