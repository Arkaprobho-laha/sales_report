module.exports = async function handler(req, res) {
  const url = `https://daluci.digital.dhineu.com/bff/v1/dashboard-bff/sales/last-upload-dates`;

  try {
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
    res.status(fetchRes.status).json(json);

  } catch (error) {
    console.error('Error in last-upload-dates proxy:', error);
    res.status(500).json({ error: error.message });
  }
}
