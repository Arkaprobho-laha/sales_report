module.exports = async function handler(req, res) {
  // Pass query strings properly, handling potential Vercel req.url if req.query has issues
  let queryString = '';
  if (req.url && req.url.includes('?')) {
    queryString = req.url.split('?')[1];
  } else {
    queryString = new URLSearchParams(req.query).toString();
  }
  
  const url = `https://daluci.digital.dhineu.com/bff/v1/dashboard-bff/sales-details-totals?${queryString}`;

  try {
    const authHeader = req.headers.authorization;
    const fetchRes = await fetch(url, {
      method: req.method,
      headers: {
        'Authorization': authHeader || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json, */*'
      }
    });

    const text = await fetchRes.text();
    let json;
    try {
      json = JSON.parse(text);
      res.status(fetchRes.status).json(json);
    } catch (e) {
      console.error('Non-JSON response received:', text);
      res.status(fetchRes.status).send(text);
    }

  } catch (error) {
    console.error('Error in sales-details-totals proxy:', error);
    res.status(500).json({ error: error.message });
  }
}
