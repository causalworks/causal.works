# Inbound Email API Reference

Manage inbound rules and query/retry processed messages via the Postmark API.

---

## Authentication

All requests require the server token:

```bash
curl -X GET "https://api.postmarkapp.com/..." \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN"
```

Or with the Node.js SDK:

```javascript
const postmark = require('postmark');
const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);
```

---

## Inbound Rules

Create rules to block unwanted senders or domains.

### Create an Inbound Rule

**POST** `/api/v1/inbound/rules`

```bash
curl -X POST "https://api.postmarkapp.com/api/v1/inbound/rules" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "Rule": "block",
    "Value": "spam@example.com"
  }'
```

**Parameters:**

| Param | Type | Values | Description |
|-------|------|--------|-------------|
| `Rule` | string | `block` | Action to take |
| `Value` | string | email or domain | Sender address or domain to block |

**Example values:**
```
"spam@example.com"    — Block specific address
"*.badomain.com"      — Block entire domain
"*@spammers.com"      — Block domain wildcard
```

**Response:**
```json
{
  "ID": 1,
  "Rule": "block",
  "Value": "spam@example.com",
  "CreatedAt": "2023-01-01T12:00:00Z"
}
```

### List Inbound Rules

**GET** `/api/v1/inbound/rules`

```bash
curl -X GET "https://api.postmarkapp.com/api/v1/inbound/rules" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN"
```

**Response:**
```json
{
  "InboundRules": [
    {
      "ID": 1,
      "Rule": "block",
      "Value": "spam@example.com",
      "CreatedAt": "2023-01-01T12:00:00Z"
    }
  ]
}
```

### Delete an Inbound Rule

**DELETE** `/api/v1/inbound/rules/:ruleId`

```bash
curl -X DELETE "https://api.postmarkapp.com/api/v1/inbound/rules/1" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN"
```

---

## Messages API (Inbound)

Query and retry processed inbound messages.

### Get Inbound Messages

**POST** `/api/v1/messages/inbound` (using filter parameters)

```bash
curl -X POST "https://api.postmarkapp.com/api/v1/messages/inbound" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "FromEmail": "sender@example.com",
    "Count": 50,
    "Offset": 0
  }'
```

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `FromEmail` | string | none | Filter by sender email |
| `ToEmail` | string | none | Filter by recipient email |
| `MailboxHash` | string | none | Filter by routing hash |
| `Count` | integer | 50 | Results per page (max 50) |
| `Offset` | integer | 0 | Pagination offset |

**Response:**
```json
{
  "TotalCount": 123,
  "InboundMessages": [
    {
      "MessageID": "00000000-0000-0000-0000-000000000000",
      "FromEmail": "sender@example.com",
      "FromName": "John Doe",
      "ToEmail": "support+ticket-456@yourdomain.com",
      "Subject": "Help needed",
      "MailboxHash": "ticket-456",
      "Status": "Processed",
      "ReceivedAt": "2023-01-01T12:00:00Z"
    }
  ]
}
```

### Get Single Inbound Message

**GET** `/api/v1/messages/inbound/:messageId/details`

```bash
curl -X GET "https://api.postmarkapp.com/api/v1/messages/inbound/00000000-0000-0000-0000-000000000000/details" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN"
```

**Response:**

Full inbound payload including headers, body, and attachments (same structure as webhook payload).

---

## Retry Failed Webhooks

If a webhook delivery failed, manually retry sending to your endpoint.

### Retry Webhook Delivery

**PUT** `/api/v1/messages/inbound/:messageId/resend`

```bash
curl -X PUT "https://api.postmarkapp.com/api/v1/messages/inbound/00000000-0000-0000-0000-000000000000/resend" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN"
```

**Response:**
```json
{
  "MessageID": "00000000-0000-0000-0000-000000000000",
  "Status": "Resending"
}
```

This queues the message to be sent to your webhook endpoint again.

---

## Webhook Logs

Check the status of webhook deliveries.

### Get Webhook Events

**GET** `/api/v1/messages/inbound/:messageId/webhooks`

```bash
curl -X GET "https://api.postmarkapp.com/api/v1/messages/inbound/00000000-0000-0000-0000-000000000000/webhooks" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN"
```

**Response:**
```json
{
  "WebhookEvents": [
    {
      "DeliveryAttempt": 1,
      "Status": "Failed",
      "HttpCode": 500,
      "ErrorMessage": "Internal Server Error",
      "ReceivedAt": "2023-01-01T12:00:00Z"
    }
  ]
}
```

---

## Node.js SDK Examples

### Query Inbound Messages

```javascript
const postmark = require('postmark');
const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);

// Get recent inbound messages
const messages = await client.getInboundMessages({
  FromEmail: 'sender@example.com',
  Count: 25,
  Offset: 0
});

console.log(`Total: ${messages.TotalCount}`);
messages.InboundMessages.forEach(msg => {
  console.log(`${msg.Subject} from ${msg.FromEmail}`);
});
```

### Get Full Message Details

```javascript
const message = await client.getInboundMessageDetails(messageId);

console.log(`Subject: ${message.Subject}`);
console.log(`From: ${message.From}`);
console.log(`Body: ${message.StrippedTextReply}`);

// Process attachments
if (message.Attachments) {
  message.Attachments.forEach(att => {
    console.log(`  Attachment: ${att.Name} (${att.ContentLength} bytes)`);
  });
}
```

### Retry Failed Webhook

```javascript
await client.retryInboundWebhook(messageId);
console.log(`Retrying webhook for message ${messageId}`);
```

### Manage Inbound Rules

```javascript
// Create rule to block a domain
const rule = await client.createInboundRule({
  Rule: 'block',
  Value: '*@spammers.com'
});

console.log(`Created rule ${rule.ID}`);

// List all rules
const rules = await client.listInboundRules();
rules.InboundRules.forEach(r => {
  console.log(`${r.Rule}: ${r.Value}`);
});

// Delete a rule
await client.deleteInboundRule(ruleId);
```

---

## Common Queries

### Find Messages from a Sender

```javascript
const messages = await client.getInboundMessages({
  FromEmail: 'john@example.com'
});
```

### Find Bounced/Failed Messages

Query with topic or filter (depends on your Postmark plan):

```javascript
// Get recent inbound messages and filter locally
const messages = await client.getInboundMessages({
  Count: 100
});

const failed = messages.InboundMessages.filter(m => 
  m.Status !== 'Processed'
);
```

### Get Message with All Details

```javascript
const message = await client.getInboundMessageDetails(messageId);

// Full body, headers, attachments
console.log(message.TextBody);
console.log(message.HtmlBody);
console.log(message.Headers);
console.log(message.Attachments);
```

### Archive/Cleanup

While Postmark doesn't have a delete endpoint, you can:
1. Query old messages with `Offset`
2. Manually delete from your own database
3. Use rules to block unwanted senders going forward

---

## Troubleshooting

### Webhook Not Receiving Messages

1. Check webhook URL is correct in Postmark settings
2. Verify endpoint returns **HTTP 200** (not 404, 500)
3. Check firewall allows HTTPS from Postmark
4. Verify authentication (if using HTTP Basic Auth or headers)

### Find Failed Deliveries

```javascript
const message = await client.getInboundMessageDetails(messageId);
const webhooks = await client.getInboundWebhookEvents(messageId);

webhooks.WebhookEvents.forEach(event => {
  console.log(`Attempt ${event.DeliveryAttempt}: ${event.Status} (HTTP ${event.HttpCode})`);
  if (event.ErrorMessage) {
    console.log(`  Error: ${event.ErrorMessage}`);
  }
});
```

If failed, retry:

```javascript
await client.retryInboundWebhook(messageId);
```

### Message Not Arriving

1. Verify email is going to the right address (check `To` field in Postmark dashboard)
2. Check inbound rules — sender might be blocked
3. Verify DNS MX records are correct and propagated
4. Check firewall/spam filters not blocking emails

---

## Rate Limits

- Query endpoints: 100 requests per second per API token
- Webhook retry: No limit, but subject to your endpoint's rate limits
- Creating/deleting rules: No documented limit

For high-volume inbound, use pagination with `Count` and `Offset` to avoid timeout.

---

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | — |
| 400 | Bad request | Check parameters |
| 401 | Unauthorized | Check API token |
| 404 | Not found | Message ID doesn't exist |
| 422 | Unprocessable entity | Validation error (check response body) |
| 429 | Rate limit exceeded | Retry with backoff |
| 500 | Server error | Postmark issue — retry later |

Check response body for `ErrorCode` and `Message` fields with details.

---

## See Also

- [Inbound Setup](inbound-setup.md) — DNS and webhook configuration
- [Payload Structure](payload-structure.md) — Webhook payload fields
- [Handler Examples](handler-examples.md) — Code examples for processing
