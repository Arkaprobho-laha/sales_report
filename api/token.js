// api/token.js
//
// Shared "global" auth-token store — backed by Vercel KV / Upstash Redis
// (plain REST calls, no SDK needed). This lets a bearer token be pasted
// once, on any device, and be picked up automatically by every other
// device — instead of being stuck in that one browser's localStorage.
//
// One-time setup:
//   Vercel dashboard → your project → Storage tab → Create Database → KV
//   (this is Upstash Redis under the hood). Vercel auto-injects
//   KV_REST_API_URL and KV_REST_API_TOKEN as environment variables —
//   nothing else to configure, no code change needed.
//   (If you set up Upstash directly instead of via Vercel Storage,
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN also work.)

const REST_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TOKEN_KEY  = 'daluci:auth-token';

async function redis(...command) {
  const resp = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!resp.ok) {
    throw new Error(`Redis error ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.result;
}

module.exports = async function handler(req, res) {
  if (!REST_URL || !REST_TOKEN) {
    return res.status(500).json({
      error: 'Shared token store not configured. Add a KV database in Vercel → Storage.'
    });
  }

  try {
    if (req.method === 'GET') {
      const token = await redis('GET', TOKEN_KEY);
      return res.status(200).json({ token: token || null });
    }

    if (req.method === 'POST') {
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ error: 'Missing token in request body.' });
      await redis('SET', TOKEN_KEY, token);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      await redis('DEL', TOKEN_KEY);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Token store error:', err);
    return res.status(500).json({ error: err.message });
  }
};
