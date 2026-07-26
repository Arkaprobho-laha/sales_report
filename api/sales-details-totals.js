const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_meesho_ads_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.meesho_ads_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.meesho_ads_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);
const https = require('https');

module.exports = async function handler(req, res) {
  // We need to proxy this to the actual API, then append the postgres data
  const { startDate, endDate, brand, platform } = req.query;

  // The actual backend URL to fetch the base JSON
  const url = `https://daluci.digital.dhineu.com/bff/v1/dashboard-bff/sales-details-totals?${new URLSearchParams(req.query).toString()}`;

  try {
    // 1. Fetch from Postgres via Supabase ONLY if platform is Meesho
    let adSpend = null;
    if (platform === 'Meesho' && startDate && endDate) {
      const dbBrand = (brand === 'Daluci') ? 'DALUCI' : 'ALL';
      
      const { data, error } = await supabase
        .from('meesho_ads')
        .select('ad_spend')
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('brand', dbBrand);
        
      if (error) {
        console.error('Supabase error:', error);
        adSpend = 0.0;
      } else if (data && data.length > 0) {
        adSpend = data.reduce((sum, row) => sum + (parseFloat(row.ad_spend) || 0), 0);
      } else {
        adSpend = 0.0;
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
    if (adSpend !== null && json.data && typeof json.data === 'object') {
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
