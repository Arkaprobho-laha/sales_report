const { sql } = require('@vercel/postgres');

export default async function handler(req, res) {
  const url = `https://daluci.digital.dhineu.com/bff/v1/dashboard-bff/sales/last-upload-dates`;

  try {
    // 1. Fetch from Postgres
    let maxDate = null;
    const { rows } = await sql`
      SELECT MAX(date) as max_date FROM meesho_ads WHERE brand = 'ALL'
    `;
    if (rows.length > 0 && rows[0].max_date) {
      maxDate = rows[0].max_date;
    }

    // 2. Fetch from External API
    const authHeader = req.headers.authorization;
    const fetchRes = await fetch(url, {
      method: req.method,
      headers: {
        'Authorization': authHeader || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const json = await fetchRes.json();

    // 3. Merge Postgres Data
    if (maxDate && Array.isArray(json.data)) {
      for (let p of json.data) {
        if (p.platform === 'Meesho') {
          if (!p.ads) p.ads = {};
          p.ads.actualLastUpload = maxDate;
        }
      }
    }

    // Return the response
    res.status(fetchRes.status).json(json);

  } catch (error) {
    console.error('Error in last-upload-dates proxy:', error);
    res.status(500).json({ error: error.message });
  }
}
