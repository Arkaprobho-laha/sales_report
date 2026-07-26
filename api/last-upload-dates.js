const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_meesho_ads_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.meesho_ads_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.meesho_ads_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  const url = `https://daluci.digital.dhineu.com/bff/v1/dashboard-bff/sales/last-upload-dates`;

  try {
    // 1. Fetch from Postgres via Supabase
    let maxDate = null;
    const { data, error } = await supabase
      .from('meesho_ads')
      .select('date')
      .eq('brand', 'ALL')
      .order('date', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
    }

    if (data && data.length > 0 && data[0].date) {
      maxDate = data[0].date;
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
