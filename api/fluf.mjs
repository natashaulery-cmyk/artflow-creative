export default async function handler(_req, res) {
  return res.status(410).json({ error: "Marketplace connector removed" });
}
