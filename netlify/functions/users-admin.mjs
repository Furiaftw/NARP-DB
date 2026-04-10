import { neon } from '@neondatabase/serverless';
import { getAuthUser, SUPER_ADMIN_EMAIL, ensureUsersTable } from './lib/auth.mjs';

async function getRequester(sql, uid) {
  const rows = await sql`SELECT * FROM users WHERE id = ${uid}`;
  return rows[0] || null;
}

export default async (req) => {
  try {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      return new Response(JSON.stringify({ error: 'Database not configured' }), { status: 500 });
    }

    const payload = getAuthUser(req);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const sql = neon(databaseUrl);
    await ensureUsersTable(sql);
    const requester = await getRequester(sql, payload.uid);
    if (!requester || requester.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // GET: list all users
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM users ORDER BY created_at DESC`;
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    // PUT: update user properties
    if (req.method === 'PUT') {
      const body = await req.json();
      const { uid } = body;
      if (!uid) {
        return new Response(JSON.stringify({ error: 'Missing uid' }), { status: 400 });
      }

      if (action === 'update_status') {
        const { status } = body;
        await sql`UPDATE users SET status = ${status} WHERE id = ${uid}`;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (action === 'update_role') {
        const { role } = body;
        const target = (await sql`SELECT * FROM users WHERE id = ${uid}`)[0];
        if (!target) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
        }
        if (role === 'admin' && requester.email !== SUPER_ADMIN_EMAIL) {
          return new Response(JSON.stringify({ error: 'Only super admin can promote to admin' }), { status: 403 });
        }
        if (target.role === 'admin' && requester.email !== SUPER_ADMIN_EMAIL) {
          return new Response(JSON.stringify({ error: 'Only super admin can demote admins' }), { status: 403 });
        }
        await sql`UPDATE users SET role = ${role} WHERE id = ${uid}`;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (action === 'update_nickname') {
        const { nickname } = body;
        if (requester.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Only admins can set nicknames' }), { status: 403 });
        }
        await sql`UPDATE users SET nickname = ${nickname || null} WHERE id = ${uid}`;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (action === 'toggle_faction') {
        const { faction } = body;
        const target = (await sql`SELECT * FROM users WHERE id = ${uid}`)[0];
        if (!target) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
        }
        let factions = [];
        try { factions = JSON.parse(target.allowed_factions || '[]'); } catch { }
        if (factions.includes(faction)) {
          factions = factions.filter(f => f !== faction);
        } else {
          factions.push(faction);
        }
        await sql`UPDATE users SET allowed_factions = ${JSON.stringify(factions)} WHERE id = ${uid}`;
        return new Response(JSON.stringify({ success: true, allowedFactions: factions }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  } catch (err) {
    console.error('users-admin error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), { status: 500 });
  }
};

export const config = {
  path: '/api/users-admin',
};
