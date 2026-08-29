// Shared Google Sheets connector id (app-user mode). Each signed-up user
// connects their own Google account via this connector; backend functions
// resolve the current user's token with getCurrentAppUserConnection(this id).
export const GOOGLE_SHEETS_CONNECTOR_ID = "6a91de0eec67a1e703268441";