import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Creates recurring monthly expense records (Visible phone, ChatGPT) for a
// given month if they don't already exist. Admin-only. Intended to run on a
// monthly schedule via a workflow, but can be invoked manually with
// { month: "YYYY-MM" } (defaults to current month).
const RECURRING = [
  { category: 'Phone / Internet', description: 'Visible work phone service', amount: 19 },
  {
    category: 'Software & Subscriptions',
    description: 'ChatGPT business subscription',
    amount: 20,
  },
];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const reqBody = await req.json().catch(() => ({}));
    const month = reqBody?.month || new Date().toISOString().slice(0, 7);
    const day = reqBody?.day || '01';
    const date = `${month}-${day}`;

    const existing = await base44.asServiceRole.entities.Expense.list('-date', 5000);
    const existingKeys = new Set(
      existing
        .filter((e) => (e.date || '').slice(0, 7) === month && e.source === 'recurring')
        .map((e) => `${month}|${e.description}`)
    );

    let created = 0;
    for (const r of RECURRING) {
      const key = `${month}|${r.description}`;
      if (existingKeys.has(key)) continue;
      await base44.asServiceRole.entities.Expense.create({
        date,
        category: r.category,
        description: r.description,
        amount: r.amount,
        deductible_percent: 100,
        deductible_amount: r.amount,
        source: 'recurring',
        notes: 'Monthly recurring',
      });
      created++;
    }

    return Response.json({ month, created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}