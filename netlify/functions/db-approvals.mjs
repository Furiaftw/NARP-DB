import { neon } from '@neondatabase/serverless';
import { ensureSchema } from './db-ensure-schema.mjs';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

const SUPER_ADMIN_EMAIL = 'grisales4000@gmail.com';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return json({ error: 'Database URL not configured' }, 500);
  }

  const sql = neon(databaseUrl);
  await ensureSchema(sql);
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    // GET — list pending entries or faction access requests
    if (req.method === 'GET') {
      if (action === 'pending_entries') {
        const status = url.searchParams.get('status') || 'pending';
        const rows = await sql.query(
          `SELECT * FROM pending_entries WHERE status = $1 ORDER BY created_at DESC`,
          [status]
        );
        return json({ rows, count: rows.length });
      }

      if (action === 'faction_requests') {
        const status = url.searchParams.get('status') || 'pending';
        const rows = await sql.query(
          `SELECT * FROM pending_faction_access WHERE status = $1 ORDER BY created_at DESC`,
          [status]
        );
        return json({ rows, count: rows.length });
      }

      if (action === 'all_pending') {
        const [entries, factionRequests] = await Promise.all([
          sql.query(`SELECT * FROM pending_entries WHERE status = 'pending' ORDER BY created_at DESC`),
          sql.query(`SELECT * FROM pending_faction_access WHERE status = 'pending' ORDER BY created_at DESC`),
        ]);
        return json({
          pending_entries: entries,
          pending_faction_requests: factionRequests,
        });
      }

      return json({ error: 'Invalid action. Use: pending_entries, faction_requests, all_pending' }, 400);
    }

    // POST — submit a new pending entry or faction access request
    if (req.method === 'POST') {
      const body = await req.json();

      if (action === 'submit_entry') {
        const { table_name, entry_data, submitted_by_email, submitted_by_role } = body;
        if (!table_name || !entry_data || !submitted_by_email || !submitted_by_role) {
          return json({ error: 'Missing required fields: table_name, entry_data, submitted_by_email, submitted_by_role' }, 400);
        }

        // Admins bypass approval — insert directly
        if (submitted_by_role === 'admin') {
          return json({ bypass: true, message: 'Admins do not need approval. Submit directly via db-admin.' });
        }

        return json({ error: 'Only admins can submit entries.' }, 403);
      }

      if (action === 'request_faction_access') {
        return json({ error: 'Only admins can manage faction access.' }, 403);
      }

      return json({ error: 'Invalid action for POST' }, 400);
    }

    // PUT — approve or deny a pending entry or faction access request
    if (req.method === 'PUT') {
      const body = await req.json();
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'Missing id parameter' }, 400);

      if (action === 'resolve_entry') {
        const { decision, approved_by_email, approved_by_role } = body;
        if (!decision || !approved_by_email || !approved_by_role) {
          return json({ error: 'Missing required fields: decision, approved_by_email, approved_by_role' }, 400);
        }
        if (!['approve', 'deny'].includes(decision)) {
          return json({ error: 'Decision must be "approve" or "deny"' }, 400);
        }

        // Fetch the pending entry
        const entries = await sql.query(`SELECT * FROM pending_entries WHERE id = $1 AND status = 'pending'`, [Number(id)]);
        if (entries.length === 0) return json({ error: 'Pending entry not found or already resolved' }, 404);

        const entry = entries[0];

        if (decision === 'deny') {
          await sql.query(
            `UPDATE pending_entries SET status = 'denied', approved_by_email = $1, approved_by_role = $2, resolved_at = NOW() WHERE id = $3`,
            [approved_by_email, approved_by_role, Number(id)]
          );
          return json({ success: true, action: 'denied' });
        }

        // Approve logic — admin only
        const entryData = JSON.parse(entry.entry_data);
        const tableName = entry.table_name;

        if (approved_by_role !== 'admin') {
          return json({ error: 'Only admins can approve entries.' }, 403);
        }

        const cols = Object.keys(entryData);
        const vals = Object.values(entryData).map(v => String(v).trim());
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const insertQuery = `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        const inserted = await sql.query(insertQuery, vals);
        const publishedRow = inserted[0];

        await sql.query(
          `UPDATE pending_entries SET status = 'approved', approved_by_email = $1, approved_by_role = $2, resolved_at = NOW() WHERE id = $3`,
          [approved_by_email, approved_by_role, Number(id)]
        );

        return json({
          success: true,
          action: 'approved',
          published_row: publishedRow,
        });
      }

      if (action === 'resolve_faction_request') {
        const { decision, approved_by_email, approved_by_role } = body;
        if (!decision || !approved_by_email || !approved_by_role) {
          return json({ error: 'Missing required fields' }, 400);
        }
        if (approved_by_role !== 'admin') {
          return json({ error: 'Only admins can resolve faction access requests.' }, 403);
        }

        const requests = await sql.query(
          `SELECT * FROM pending_faction_access WHERE id = $1 AND status = 'pending'`,
          [Number(id)]
        );
        if (requests.length === 0) return json({ error: 'Request not found or already resolved' }, 404);

        const request = requests[0];

        if (decision === 'deny') {
          await sql.query(
            `UPDATE pending_faction_access SET status = 'denied', approved_by_email = $1, approved_by_role = $2, resolved_at = NOW() WHERE id = $3`,
            [approved_by_email, approved_by_role, Number(id)]
          );
          return json({ success: true, action: 'denied' });
        }

        await sql.query(
          `UPDATE pending_faction_access SET status = 'approved', approved_by_email = $1, approved_by_role = $2, resolved_at = NOW() WHERE id = $3`,
          [approved_by_email, approved_by_role, Number(id)]
        );
        return json({
          success: true,
          action: 'approved',
          grant_access: true,
          target_uid: request.target_uid,
          faction: request.faction,
        });
      }

      return json({ error: 'Invalid action for PUT' }, 400);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
};

export const config = {
  path: '/api/db-approvals',
};
