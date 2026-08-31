import dns from 'node:dns/promises';

export default async function handler(req, res) {
  try {
    const ns = await dns.resolveNs('artflowcreativeapp.com');
    res.status(200).json({ ns });
  } catch (error) {
    res.status(200).json({ ns: [], error: error?.code || error?.message || 'dns_error' });
  }
}
