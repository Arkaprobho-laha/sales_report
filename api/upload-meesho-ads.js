const { sql } = require('@vercel/postgres');
const xlsx = require('xlsx');

// Disable Vercel's default body parser to handle raw binary data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Collect the raw binary data from the request
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Empty file' });
    }

    // Initialize/Create table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS meesho_ads (
        date VARCHAR(10) NOT NULL,
        brand VARCHAR(20) NOT NULL,
        ad_spend DECIMAL(10, 2) NOT NULL,
        UNIQUE(date, brand)
      );
    `;

    // Parse Excel
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // raw: false ensures we get formatted strings for dates if possible, but xlsx date parsing can be tricky.
    // Let's use cellDates: true to get JS Date objects
    const data = xlsx.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in Excel' });
    }

    // Group by Date
    const grouped = {};
    for (const row of data) {
      let rawDate = row['Date'];
      if (!rawDate) continue;
      
      let dateStr = rawDate;
      // If it's MM/DD/YY or similar, let's try to normalize it to YYYY-MM-DD
      // xlsx with raw: false and dateNF might output YYYY-MM-DD directly
      // Or we just parse it if it's a string
      let parsedDate = new Date(rawDate);
      if (!isNaN(parsedDate.getTime())) {
        dateStr = parsedDate.toISOString().split('T')[0];
      }

      const accountName = String(row['Account Name'] || '').trim().toUpperCase();
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

    // Insert into Postgres
    for (const [dateStr, sums] of Object.entries(grouped)) {
      const allSpend = sums.all;
      const daluciSpend = 0.0; // Hardcoded to 0 for Daluci

      await sql`
        INSERT INTO meesho_ads (date, brand, ad_spend)
        VALUES (${dateStr}, 'ALL', ${allSpend})
        ON CONFLICT (date, brand) 
        DO UPDATE SET ad_spend = EXCLUDED.ad_spend;
      `;

      await sql`
        INSERT INTO meesho_ads (date, brand, ad_spend)
        VALUES (${dateStr}, 'DALUCI', ${daluciSpend})
        ON CONFLICT (date, brand) 
        DO UPDATE SET ad_spend = EXCLUDED.ad_spend;
      `;
    }

    res.status(200).json({ success: true, message: 'Meesho Ads updated in Postgres' });

  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: error.message });
  }
}
