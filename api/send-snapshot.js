const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── Env vars (set in Vercel Dashboard → Settings → Environment Variables)
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const MAIL_RECIPIENTS = process.env.MAIL_RECIPIENTS; // comma-separated

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !MAIL_RECIPIENTS) {
    console.error('Missing env: GMAIL_USER, GMAIL_APP_PASSWORD, or MAIL_RECIPIENTS');
    return res.status(500).json({ error: 'Email service not configured.' });
  }

  // ── Parse body
  const { imageBase64, subject, periodString, additionalEmails } = req.body || {};

  if (!imageBase64) {
    return res.status(400).json({ error: 'Missing imageBase64 in request body.' });
  }

  // Strip data URL prefix if present: "data:image/png;base64,..."
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // ── Build email
  const yesterdayIST = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const fallbackDate = yesterdayIST.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  
  const finalPeriod = periodString || fallbackDate;
  const emailSubject = subject || `DALUCI Sales and Ads Report — ${finalPeriod}`;
  
  // Combine env recipients with user-provided additional ones
  let allRecipients = MAIL_RECIPIENTS ? MAIL_RECIPIENTS.split(',') : [];
  if (additionalEmails && typeof additionalEmails === 'string') {
    allRecipients = allRecipients.concat(additionalEmails.split(','));
  }
  const recipients = allRecipients.map(e => e.trim()).filter(Boolean);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"DALUCI Dashboard" <${GMAIL_USER}>`,
    to: recipients.join(', '),
    subject: emailSubject,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <div style="background: #1a2332; color: #ffffff; padding: 20px 28px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 22px; letter-spacing: 2px;">DALUCI</h1>
          <p style="margin: 4px 0 0; font-size: 13px; color: #a0b4c8;">Sales, Ads & Returns Report · ${finalPeriod}</p>
        </div>
        <div style="background: #f5f0e8; padding: 24px 28px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 14px; color: #333; margin: 0 0 12px;">Hi Team,</p>
          <p style="font-size: 14px; color: #333; line-height: 1.6; margin: 0 0 12px;">
            Attached is the latest DALUCI sales, ads, and returns report — channel-wise performance, monthly
            run-rate, ad spend, and returns across all platforms, current for the period: <b>${finalPeriod}</b>.
          </p>
          <p style="font-size: 14px; color: #333; line-height: 1.6; margin: 0 0 12px;">
            Take a look and flag anything that needs follow-up.
          </p>
          <p style="font-size: 14px; color: #333; margin: 20px 0 0;">Best,<br/>DALUCI Dashboard</p>
          <p style="font-size: 11px; color: #888; margin-top: 22px; border-top: 1px solid #e0d8c8; padding-top: 12px;">
            This is an automated email from the DALUCI Sales, Ads & Returns Report.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `daluci-dashboard-${finalPeriod.replace(/[\/\\]/g, '-').replace(/[^a-zA-Z0-9-]/g, '_')}.png`,
        content: imageBuffer,
        contentType: 'image/png',
        cid: 'dashboard-snapshot',
      },
    ],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      recipients: recipients,
    });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({
      error: 'Failed to send email.',
      detail: err.message,
    });
  }
};
