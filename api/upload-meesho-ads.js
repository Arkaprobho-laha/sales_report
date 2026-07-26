const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_meesho_ads_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.meesho_ads_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.meesho_ads_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);
const xlsx = require('xlsx');

// Disable Vercel's default body parser to handle raw binary data
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Collect the raw binary data from the request
    let buffer;
    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (req.body && typeof req.body === 'string') {
      buffer = Buffer.from(req.body, 'base64');
    } else {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);
    }

    if (!buffer || buffer.length === 0) {
      console.error("Upload error: Empty file buffer. req.body type:", typeof req.body);
      return res.status(400).json({ error: 'Empty file' });
    }

    // Parse Excel
    let workbook;
    try {
      workbook = xlsx.read(buffer, { type: 'buffer' });
    } catch (parseErr) {
      console.error("Upload error: Could not parse excel file", parseErr);
      return res.status(400).json({ error: 'Invalid Excel file format: ' + parseErr.message });
    }
    
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // raw: false ensures we get formatted strings for dates if possible, but xlsx date parsing can be tricky.
    // Let's use cellDates: true to get JS Date objects
    const data = xlsx.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });

    if (data.length === 0) {
      console.error("Upload error: No data found in Excel sheet");
      return res.status(400).json({ error: 'No data found in Excel' });
    }

    // Group by Date
    const grouped = {};
    for (const row of data) {
      let rawDate = row['Date'];
      if (!rawDate) continue;
      
      let dateStr = String(rawDate).trim();
      let parsedDate = new Date(dateStr);
      
      if (!isNaN(parsedDate.getTime())) {
        // Valid Date object
        dateStr = parsedDate.toISOString().split('T')[0];
      } else {
        // Try parsing DD-MM-YYYY or DD/MM/YYYY
        let parts = dateStr.split(/[-/]/);
        if (parts.length === 3) {
          let day = parts[0];
          let month = parts[1];
          let year = parts[2];
          if (year.length === 2) year = '20' + year; // handle YY
          // Format as YYYY-MM-DD
          dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }

      const adSpend = parseFloat(row['Ad Spend']) || 0.0;

      if (!grouped[dateStr]) {
        grouped[dateStr] = {
          all: 0.0,
          daluci: 0.0
        };
      }

      grouped[dateStr].all += adSpend;
      // Daluci brand should remain blank (0) for Meesho Ads according to latest requirements
      // So we don't actually add to daluci here.
    }

    // Insert into Postgres via Supabase
    for (const [dateStr, sums] of Object.entries(grouped)) {
      const allSpend = sums.all;
      const daluciSpend = 0.0; // Hardcoded to 0 for Daluci

      const { error: err1 } = await supabase
        .from('meesho_ads')
        .upsert(
          { date: dateStr, brand: 'ALL', ad_spend: allSpend },
          { onConflict: 'date,brand' }
        );
      
      if (err1) {
        console.error("Supabase upsert error (ALL):", err1);
        return res.status(500).json({ error: 'Database Error (ALL): ' + (err1.message || JSON.stringify(err1)) });
      }

      const { error: err2 } = await supabase
        .from('meesho_ads')
        .upsert(
          { date: dateStr, brand: 'DALUCI', ad_spend: daluciSpend },
          { onConflict: 'date,brand' }
        );
        
      if (err2) {
        console.error("Supabase upsert error (DALUCI):", err2);
        return res.status(500).json({ error: 'Database Error (DALUCI): ' + (err2.message || JSON.stringify(err2)) });
      }
    }

    res.status(200).json({ success: true, message: 'Meesho Ads updated in Postgres' });

  } catch (error) {
    console.error("Upload error: Unhandled exception", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
