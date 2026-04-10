import { neon } from '@neondatabase/serverless';
import { createToken, randomUUID, SUPER_ADMIN_EMAIL, ensureUsersTable } from './lib/auth.mjs';

export default async (req) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get('code');
  const state = reqUrl.searchParams.get('state') || '';
  const error = reqUrl.searchParams.get('error');

  // Derive the site origin from the incoming request so redirect_uri always matches
  const siteOrigin = `${reqUrl.protocol}//${reqUrl.host}`;
  const redirectUri = `${siteOrigin}/api/auth/google/callback`;
  const frontendBase = siteOrigin;

  const fail = (reason) =>
    Response.redirect(`${frontendBase}/?google_error=${encodeURIComponent(reason)}&state=${encodeURIComponent(state)}`);

  if (error || !code) {
    return fail(error || 'No authorization code returned by Google.');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return fail('Google OAuth is not configured on this server.');
  }

  try {
    // ── Exchange authorization code for access token ──────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return fail('Token exchange with Google failed.');
    }

    // ── Fetch Google user profile ─────────────────────────────────
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleUser = await profileRes.json();
    if (!profileRes.ok || !googleUser.email) {
      return fail('Could not retrieve Google profile.');
    }

    // ── Find or create user in database ───────────────────────────
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      return fail('Database not configured.');
    }

    const sql = neon(databaseUrl);
    await ensureUsersTable(sql);

    const email = googleUser.email.toLowerCase();
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL;

    let rows = await sql`SELECT * FROM users WHERE LOWER(email) = ${email}`;
    let user;

    if (rows.length === 0) {
      // New user — insert with pending status (admin must approve)
      const id = randomUUID();
      const role = isSuperAdmin ? 'admin' : 'user';
      const status = isSuperAdmin ? 'approved' : 'pending';
      await sql`
        INSERT INTO users (id, email, role, status, allowed_factions, created_at)
        VALUES (${id}, ${email}, ${role}, ${status}, '[]', NOW())
      `;
      user = { id, email, role, status, nickname: null, allowed_factions: '[]' };
    } else {
      user = rows[0];
      // Ensure super admin always has correct role / status
      if (isSuperAdmin && (user.role !== 'admin' || user.status !== 'approved')) {
        await sql`UPDATE users SET role = 'admin', status = 'approved' WHERE id = ${user.id}`;
        user.role = 'admin';
        user.status = 'approved';
      }
    }

    if (user.status === 'pending') return fail('pending');
    if (user.status === 'denied') return fail('denied');

    // ── Issue our own app token and redirect back to the SPA ──────
    const appToken = createToken(user);
    return Response.redirect(
      `${frontendBase}/?google_token=${encodeURIComponent(appToken)}&state=${encodeURIComponent(state)}`
    );
  } catch (err) {
    console.error('auth-google-callback error:', err);
    return fail('An unexpected error occurred during Google sign-in.');
  }
};

export const config = {
  path: '/api/auth/google/callback',
};
