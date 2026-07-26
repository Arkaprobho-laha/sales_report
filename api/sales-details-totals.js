const { sql } = require('@vercel/postgres');
const https = require('https');

module.exports = async function handler(req, res) {
  // We need to proxy this to the actual API, then append the postgres data
  const { startDate, endDate, brand } = req.query;

  // The actual backend URL to fetch the base JSON
  const url = `https://daluci.digital.dhineu.com/bff/v1/dashboard-bff/sales-details-totals?${new URLSearchParams(req.query).toString()}`;

  try {
    // 1. Fetch from Postgres
    let adSpend = 0.0;
    if (startDate && endDate) {
      const dbBrand = (brand === 'Daluci') ? 'DALUCI' : 'ALL';
      
      const { rows } = await sql`
        SELECT SUM(ad_spend) as total
        FROM meesho_ads
        WHERE date >= ${startDate} AND date <= ${endDate} AND brand = ${dbBrand}
      `;
      if (rows.length > 0 && rows[0].total != null) {
        adSpend = parseFloat(rows[0].total);
      }
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
    if (json.data && typeof json.data === 'object') {
      json.data.totalAdsSpend = adSpend;
      if (brand !== 'Daluci') {
        json.data.totalAdsSpendAll = adSpend;
      }
    }

    // Return the response
    res.status(fetchRes.status).json(json);

  } catch (error) {
    console.error('Error in sales-details-totals proxy:', error);
    res.status(500).json({ error: error.message });
  }
}
