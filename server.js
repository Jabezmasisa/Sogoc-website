import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
const BOOTSTRAPPED_ADMIN_EMAILS = new Set([
  'jabezpeter23@gmail.com',
  'jccsondusogoc@gmail.com',
]);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '1mb' }));

function getSmsGatewayStatus() {
  const hasAfricasTalking = Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
  const hasTwilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  );

  if (hasAfricasTalking) {
    return {
      configured: true,
      provider: 'africastalking',
      senderHint: process.env.AT_SENDER_ID || null,
    };
  }
  if (hasTwilio) {
    return {
      configured: true,
      provider: 'twilio',
      senderHint: process.env.TWILIO_FROM_NUMBER || null,
    };
  }
  return {
    configured: false,
    provider: null,
    senderHint: null,
  };
}

function normalizePhone(raw) {
  const trimmed = String(raw || '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) {
    return `+254${digits.slice(1)}`;
  }
  if (digits.startsWith('254') && digits.length === 12) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

async function verifyAdminBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Authorization Bearer token.' };
  }
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    return { ok: false, status: 401, error: 'Empty Firebase ID token.' };
  }

  const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;
  const lookupRes = await fetch(lookupUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!lookupRes.ok) {
    return { ok: false, status: 401, error: 'Invalid or expired Firebase ID token.' };
  }

  const lookupData = await lookupRes.json();
  const account = lookupData?.users?.[0];
  if (!account) {
    return { ok: false, status: 403, error: 'Invalid administrator account.' };
  }

  const email = String(account.email || '').toLowerCase();
  const uid = String(account.localId || '');

  const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents`;

  let isVerifiedSession = Boolean(account.emailVerified);
  if (!isVerifiedSession && uid) {
    const passSessionUrl = `${baseDocsUrl}/adminPassSessions/${encodeURIComponent(uid)}`;
    const passSessionCheck = await fetch(passSessionUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (passSessionCheck.ok) {
      isVerifiedSession = true;
    }
  }

  if (!isVerifiedSession) {
    return { ok: false, status: 403, error: 'Verified admin account or secret passcode session required.' };
  }

  if (BOOTSTRAPPED_ADMIN_EMAILS.has(email)) {
    return { ok: true, uid, email };
  }

  const adminDocUrl = `${baseDocsUrl}/admins/${encodeURIComponent(uid)}`;
  const adminCheck = await fetch(adminDocUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (adminCheck.ok) {
    return { ok: true, uid, email };
  }

  if (email) {
    const adminEmailDocUrl = `${baseDocsUrl}/adminEmails/${encodeURIComponent(email)}`;
    const emailCheck = await fetch(adminEmailDocUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (emailCheck.ok) {
      return { ok: true, uid, email };
    }
  }

  return { ok: false, status: 403, error: 'User is not an authorized administrator.' };
}

async function sendViaAfricasTalking({ recipients, message }) {
  const isSandbox = process.env.AT_ENV === 'sandbox';
  const endpoint = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  const params = new URLSearchParams();
  params.set('username', process.env.AT_USERNAME);
  params.set('to', recipients.map((r) => r.phoneNumber).join(','));
  params.set('message', message);
  if (process.env.AT_SENDER_ID) {
    params.set('from', process.env.AT_SENDER_ID);
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      apiKey: process.env.AT_API_KEY,
    },
    body: params.toString(),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errText = body?.SMSMessageData?.Message || `HTTP ${res.status}`;
    return recipients.map((r) => ({
      congregantId: r.id,
      congregantName: r.name,
      phoneNumber: r.phoneNumber,
      status: 'failed',
      providerMessageId: '',
      error: String(errText).slice(0, 280),
    }));
  }

  const carrierRecipients = body?.SMSMessageData?.Recipients || [];
  const byNumber = new Map(
    carrierRecipients.map((item) => [String(item.number), item])
  );

  return recipients.map((r) => {
    const match = byNumber.get(r.phoneNumber);
    const success =
      match &&
      (String(match.status).toLowerCase() === 'success' ||
        Number(match.statusCode) === 100 ||
        Number(match.statusCode) === 101 ||
        Number(match.statusCode) === 102);

    return {
      congregantId: r.id,
      congregantName: r.name,
      phoneNumber: r.phoneNumber,
      status: success ? 'sent' : 'failed',
      providerMessageId: match?.messageId ? String(match.messageId) : '',
      error: success ? '' : String(match?.status || 'Carrier rejected recipient').slice(0, 280),
    };
  });
}

async function sendViaTwilio({ recipients, message, senderNumber }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER || senderNumber;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    sid
  )}/Messages.json`;

  const results = [];
  for (const r of recipients) {
    const params = new URLSearchParams();
    params.set('To', r.phoneNumber);
    params.set('From', from);
    params.set('Body', message);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sid) {
        results.push({
          congregantId: r.id,
          congregantName: r.name,
          phoneNumber: r.phoneNumber,
          status: 'sent',
          providerMessageId: String(data.sid),
          error: '',
        });
      } else {
        results.push({
          congregantId: r.id,
          congregantName: r.name,
          phoneNumber: r.phoneNumber,
          status: 'failed',
          providerMessageId: '',
          error: String(data.message || `HTTP ${res.status}`).slice(0, 280),
        });
      }
    } catch (err) {
      results.push({
        congregantId: r.id,
        congregantName: r.name,
        phoneNumber: r.phoneNumber,
        status: 'failed',
        providerMessageId: '',
        error: String(err instanceof Error ? err.message : err).slice(0, 280),
      });
    }
  }
  return results;
}

const DEFAULT_ADMIN_ACCESS_DIGEST =
  '41b6a424012a7984dc24f60ab7d42a7d81d79bc87e66d4ceac0c0fafa6670cca';

function matchesAdminSecretPassword(candidate) {
  const input = String(candidate || '');
  if (!input) return false;
  const candidateDigest = crypto.createHash('sha256').update(input).digest();
  const expectedHex = process.env.ADMIN_ACCESS_PASSWORD
    ? crypto.createHash('sha256').update(process.env.ADMIN_ACCESS_PASSWORD).digest('hex')
    : DEFAULT_ADMIN_ACCESS_DIGEST;
  const expectedDigest = Buffer.from(expectedHex, 'hex');
  if (candidateDigest.length !== expectedDigest.length) {
    return false;
  }
  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

app.post('/api/auth/verify-admin-access', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Enter a valid administrator email address.' });
  }
  if (!matchesAdminSecretPassword(password)) {
    return res.status(401).json({ ok: false, error: 'Invalid secret password for admin access.' });
  }
  return res.json({ ok: true });
});

app.get('/api/sms/config', (_req, res) => {
  res.json(getSmsGatewayStatus());
});

app.post('/api/sms/send', async (req, res) => {
  try {
    const authResult = await verifyAdminBearerToken(req.headers.authorization);
    if (!authResult.ok) {
      return res.status(authResult.status).json({
        ok: false,
        configured: getSmsGatewayStatus().configured,
        provider: 'unconfigured',
        status: 'failed',
        sentCount: 0,
        failedCount: 0,
        errorMessage: authResult.error,
        results: [],
      });
    }

    const senderNumber = normalizePhone(req.body?.senderNumber);
    const message = String(req.body?.message || '').trim().slice(0, 640);
    const rawRecipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];

    const recipients = rawRecipients
      .map((item) => ({
        id: String(item?.id || '').slice(0, 128),
        name: String(item?.name || 'Congregant').trim().slice(0, 120),
        phoneNumber: normalizePhone(item?.phoneNumber),
      }))
      .filter((r) => r.id && /^\+[1-9][0-9]{6,14}$/.test(r.phoneNumber));

    if (!/^\+[1-9][0-9]{6,14}$/.test(senderNumber)) {
      return res.status(400).json({
        ok: false,
        configured: getSmsGatewayStatus().configured,
        provider: 'unconfigured',
        status: 'failed',
        sentCount: 0,
        failedCount: recipients.length,
        errorMessage: 'A valid admin sender phone number is required.',
        results: recipients.map((r) => ({
          congregantId: r.id,
          congregantName: r.name,
          phoneNumber: r.phoneNumber,
          status: 'failed',
          providerMessageId: '',
          error: 'Invalid sender number',
        })),
      });
    }

    if (!message || recipients.length === 0) {
      return res.status(400).json({
        ok: false,
        configured: getSmsGatewayStatus().configured,
        provider: 'unconfigured',
        status: 'failed',
        sentCount: 0,
        failedCount: recipients.length,
        errorMessage: 'Message text and at least one valid recipient are required.',
        results: [],
      });
    }

    const gateway = getSmsGatewayStatus();
    if (!gateway.configured) {
      const errorMessage =
        'SMS gateway credentials are not configured on the server. Set AT_API_KEY & AT_USERNAME (Africa’s Talking) or TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN (Twilio) in server environment variables.';
      return res.status(503).json({
        ok: false,
        configured: false,
        provider: 'unconfigured',
        status: 'failed',
        sentCount: 0,
        failedCount: recipients.length,
        errorMessage,
        results: recipients.map((r) => ({
          congregantId: r.id,
          congregantName: r.name,
          phoneNumber: r.phoneNumber,
          status: 'failed',
          providerMessageId: '',
          error: 'SMS gateway not configured on server',
        })),
      });
    }

    const results =
      gateway.provider === 'africastalking'
        ? await sendViaAfricasTalking({ recipients, message })
        : await sendViaTwilio({ recipients, message, senderNumber });

    const sentCount = results.filter((r) => r.status === 'sent').length;
    const failedCount = results.length - sentCount;
    const status =
      sentCount === results.length ? 'sent' : sentCount > 0 ? 'partial' : 'failed';
    const firstError = results.find((r) => r.error)?.error || '';

    return res.status(sentCount > 0 ? 200 : 502).json({
      ok: sentCount > 0,
      configured: true,
      provider: gateway.provider,
      status,
      sentCount,
      failedCount,
      errorMessage: failedCount > 0 ? firstError || 'Some messages failed to dispatch.' : '',
      results,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      configured: getSmsGatewayStatus().configured,
      provider: getSmsGatewayStatus().provider || 'unconfigured',
      status: 'failed',
      sentCount: 0,
      failedCount: 0,
      errorMessage: err instanceof Error ? err.message : 'Unexpected server SMS error.',
      results: [],
    });
  }
});

// Built Vite assets for the Admin Portal and public static assets
app.use('/assets', express.static(path.join(__dirname, 'dist', 'assets')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// Admin Portal route
app.get(['/admin', '/admin/', '/admin.html'], (_req, res) => {
  const builtAdmin = path.join(__dirname, 'dist', 'admin.html');
  if (fs.existsSync(builtAdmin)) {
    return res.sendFile(builtAdmin);
  }
  return res
    .status(503)
    .send('Admin portal bundle is building. Run "npm run build" and refresh.');
});

// Public website static files (do not expose dotfiles, config, or src)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/admin')) {
    const builtAdmin = path.join(__dirname, 'dist', 'admin.html');
    if (fs.existsSync(builtAdmin)) {
      return res.sendFile(builtAdmin);
    }
  }
  return res.sendFile(path.join(__dirname, 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}

export default app;
