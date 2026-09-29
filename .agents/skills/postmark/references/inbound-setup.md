# Inbound Email Configuration

## Overview

Two options to configure inbound email processing with Postmark:

1. **MX Records** (recommended) — Full control, scales well
2. **Email Forwarding** (simpler setup, forwarding service required)

Choose one for your server. You can have only ONE inbound stream per server.

---

## Option 1: MX Records (Recommended)

Use this approach if you own the domain and can modify DNS records.

### Step 1: Configure Inbound Server in Postmark

1. Go to [Postmark Account](https://account.postmarkapp.com)
2. Select your server (or create a new one)
3. Navigate to **Settings → Inbound**
4. Enable inbound processing
5. Copy the inbound domain provided by Postmark (e.g., `inbound.postmarkapp.com`)

### Step 2: Update DNS MX Records

Add MX records pointing to Postmark's inbound server:

```
Type: MX
Name: yourdomain.com (or subdomain like mail.yourdomain.com)
Priority: 10
Value: inbound.postmarkapp.com
```

**Example DNS config:**
```
yourdomain.com.        MX  10  inbound.postmarkapp.com
```

### Step 3: Set Webhook URL

Back in Postmark dashboard:
1. **Settings → Inbound → Webhook URL**
2. Enter your endpoint URL: `https://yourdomain.com/webhooks/inbound`
3. Test the webhook (Postmark will POST a test payload)

### Step 4: Verify DNS Propagation

DNS changes take 15 minutes to 48 hours to propagate globally.

Test with:
```bash
nslookup -type=MX yourdomain.com
# Should show inbound.postmarkapp.com
```

Or use online tools: [MXToolbox](https://mxtoolbox.com)

---

## Option 2: Email Forwarding

Use this if you don't control DNS or want a simpler setup. Requires a forwarding service.

### How It Works

```
Sender → Your Email Address → Forwarding Service → Postmark Webhook → Your App
```

### Step 1: Create a Forwarding Rule

Examples:
- **Gmail** → Create a filter to forward to your inbound address
- **Mailgun Forwarding** → Forward to a Mailgun route
- **Custom mail service** → Forward to Postmark's inbound address

### Step 2: Configure Postmark

1. Go to **Settings → Inbound**
2. Enable inbound processing
3. Set webhook URL as above
4. Choose "Email Forwarding" mode (if available in your plan)

### Step 3: Test

Send an email to your forwarding address — it should appear in Postmark's webhook.

---

## Webhook URL Configuration

### Basic Webhook URL

```
https://yourdomain.com/webhooks/inbound
```

The webhook must:
- Accept **HTTP POST** requests
- Parse JSON body
- Return **HTTP 200** immediately (even if processing fails)
- Handle large payloads (attachments can be 50MB+)

### Webhook Authentication (Recommended)

Postmark supports HTTP Basic Auth and custom headers to verify requests.

**Option A: HTTP Basic Auth**
1. Set `HttpAuth.Username` and `HttpAuth.Password` in webhook config
2. Postmark includes Authorization header in requests
3. Your endpoint validates the header

**Option B: Custom Headers**
1. Add custom headers in webhook config
2. Postmark includes them in every request
3. Your endpoint checks for the header

Example webhook creation with auth:
```javascript
const webhook = {
  Url: 'https://yourdomain.com/webhooks/inbound',
  HttpAuth: {
    Username: 'webhook-user',
    Password: 'webhook-secret-password'
  },
  HttpHeaders: [
    { Name: 'X-API-Key', Value: 'your-secret-key' }
  ]
};
```

---

## Inbound Address Format

### Standard Address

```
support@yourdomain.com
```

All emails to this address are processed.

### MailboxHash Routing

Use `+` addressing to route to specific records:

```
support+order-123@yourdomain.com      → MailboxHash: "order-123"
support+ticket-456@yourdomain.com     → MailboxHash: "ticket-456"
notifications+user-789@yourdomain.com → MailboxHash: "user-789"
```

The portion after `+` is extracted as `MailboxHash` in the webhook payload. Use this to thread replies back to conversations.

---

## Retry Schedule

If your webhook endpoint returns a non-200 status, Postmark retries according to this schedule:

| Attempt | Delay | Cumulative |
|---------|-------|-----------|
| 1 | Immediate | —— |
| 2 | 1 minute | 1m |
| 3 | 3 minutes | 4m |
| 4 | 5 minutes | 9m |
| 5 | 10 minutes | 19m |
| 6 | 30 minutes | 49m |
| 7 | 1 hour | 1h 49m |
| 8 | 4 hours | 5h 49m |
| 9 | 8 hours | 13h 49m |
| 10 | 24 hours | 37h 49m |

After 10 attempts over ~38 hours, the message is discarded (unless you manually retry via API).

**Important:** Returning **HTTP 403 Forbidden** permanently stops retries immediately — use only if you intentionally reject the message.

---

## Webhook Testing

### Test Webhook via Dashboard

In Postmark dashboard:
1. **Settings → Inbound → Webhooks**
2. Click "Test" on your webhook
3. Postmark sends a sample payload
4. Check your endpoint logs for the request

### Manual Test with curl

Once configured, test by sending an email to your inbound address and checking your logs.

Or use `curl` to simulate a webhook POST:

```bash
curl -X POST https://yourdomain.com/webhooks/inbound \
  -H "Content-Type: application/json" \
  -d '{
    "From": "sender@example.com",
    "Subject": "Test email",
    "MailboxHash": "order-123",
    "TextBody": "This is a test.",
    "StrippedTextReply": "This is a test.",
    "Attachments": []
  }'
```

Expected response: **HTTP 200**

---

## Common Issues

### Issue: Emails Not Arriving

**Check:**
1. DNS MX records are set correctly (use `nslookup`)
2. DNS has propagated (wait 24 hours if recent change)
3. Webhook URL is correct in Postmark dashboard
4. Webhook endpoint is accessible from the internet (test with curl)
5. Email is going to the right inbound address

### Issue: Webhook Not Being Called

**Check:**
1. Endpoint returns HTTP 200 (not 404, 500, etc.)
2. Endpoint is publicly accessible
3. Firewall allows HTTPS traffic
4. Check Postmark logs for failed webhook attempts

### Issue: Large Attachments Fail

**Fix:**
Set body size limit on your express app:
```javascript
app.use(express.json({ limit: '50mb' }));
```

### Issue: 403 Response Stops Retries

**Don't use 403** unless you want to permanently reject. Use:
- **400** for invalid format (still retries)
- **500** for temporary server error (still retries)
- **200** always (even if queued for async processing)

---

## Security Best Practices

1. **Verify webhook source** — Use HTTP Basic Auth or custom headers
2. **HTTPS only** — Webhook URL must use HTTPS
3. **Validate MailboxHash** — Don't trust routing without validation
4. **Handle large payloads** — Set appropriate body size limits
5. **Process asynchronously** — Return 200 immediately, process in background
6. **Log all requests** — Keep audit trail of received emails
7. **Rate limit** — Implement rate limiting if you expect high volume

---

## Migration Path

If you already have email set up elsewhere:

1. **Create inbound server in Postmark** (separate from your current email)
2. **Update DNS or forwarding** to point to Postmark
3. **Set webhook URL** in Postmark
4. **Test thoroughly** — send test emails, verify webhook receives them
5. **Cutover** — switch production traffic once verified

During cutover window, monitor logs for any missed emails.
