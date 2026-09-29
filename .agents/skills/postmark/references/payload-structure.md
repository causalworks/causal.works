# Inbound Webhook Payload Structure

## Full Payload Example

```json
{
  "FromName": "John Doe",
  "From": "john@example.com",
  "FromFull": {
    "Email": "john@example.com",
    "Name": "John Doe"
  },
  "To": "support+ticket-456@yourdomain.com",
  "ToFull": [
    {
      "Email": "support+ticket-456@yourdomain.com",
      "Name": ""
    }
  ],
  "Cc": "",
  "CcFull": [],
  "Bcc": "",
  "BccFull": [],
  "Subject": "Help with my order",
  "MessageID": "00000000-0000-0000-0000-000000000000",
  "ReplyTo": "",
  "MailboxHash": "ticket-456",
  "Date": "Thu, 5 Apr 2012 16:59:01 +0200",
  "TextBody": "This is the reply text.\n\nOn 2012-04-05, at 14:30, support@yourdomain.com wrote:\n\n> Original message text here",
  "HtmlBody": "<html><body><p>This is the reply text.</p><blockquote>...",
  "StrippedTextReply": "This is the reply text.",
  "StrippedHtmlReply": "<html><body><p>This is the reply text.</p></body></html>",
  "Tag": "",
  "Headers": [
    {
      "Name": "X-Custom-Header",
      "Value": "my-value"
    },
    {
      "Name": "Received",
      "Value": "from mail.example.com ..."
    }
  ],
  "Attachments": [
    {
      "Name": "invoice.pdf",
      "Content": "JVBERi0xLjQKJeLj...",
      "ContentType": "application/pdf",
      "ContentLength": 1234,
      "ContentID": null
    },
    {
      "Name": "signature.png",
      "Content": "iVBORw0KGgoAAAAN...",
      "ContentType": "image/png",
      "ContentLength": 567,
      "ContentID": "signature@01ABC123.4567"
    }
  ]
}
```

---

## Field Reference

### Sender Information

| Field | Type | Description |
|-------|------|-------------|
| `From` | string | Sender email address (e.g., `john@example.com`) |
| `FromName` | string | Sender display name (e.g., `John Doe`) |
| `FromFull` | object | Sender as `{Email, Name}` object |
| `ReplyTo` | string | Reply-To header, if set |

### Recipient Information

| Field | Type | Description |
|-------|------|-------------|
| `To` | string | Primary recipient email |
| `ToFull` | array | Full recipient objects `[{Email, Name}, ...]` |
| `Cc` | string | CC recipients (comma-separated) |
| `CcFull` | array | Full CC objects |
| `Bcc` | string | BCC recipients (if provided) |
| `BccFull` | array | Full BCC objects |

### Message Content

| Field | Type | Description |
|-------|------|-------------|
| `Subject` | string | Email subject line |
| `TextBody` | string | Full plain text body (includes quoted replies) |
| `HtmlBody` | string | Full HTML body (includes quoted content) |
| `StrippedTextReply` | string | **Plain text reply only** — quoted content removed |
| `StrippedHtmlReply` | string | **HTML reply only** — quoted content removed |

**Important:** Use `StrippedTextReply` or `StrippedHtmlReply` to get only the new message, without quoted text from previous emails in the thread.

### Message Metadata

| Field | Type | Description |
|-------|------|-------------|
| `MessageID` | string | Unique Postmark message ID (UUID format) |
| `Date` | string | Email date (RFC 2822 format) |
| `MailboxHash` | string | The portion after `+` in the recipient address (e.g., `ticket-456` from `support+ticket-456@domain.com`) |
| `Tag` | string | Tag from original message (if tagged) |

### Headers

| Field | Type | Description |
|-------|------|-------------|
| `Headers` | array | All email headers as `[{Name, Value}, ...]` |

**Common headers to extract:**
- `In-Reply-To` — Message ID this is replying to
- `References` — Thread references (chain of Message-IDs)
- `X-Custom-Header` — Your custom headers

### Attachments

| Field | Type | Description |
|-------|------|-------------|
| `Attachments` | array | Array of attachment objects |
| `Attachment.Name` | string | Original filename (e.g., `invoice.pdf`) |
| `Attachment.Content` | string | Base64-encoded file content |
| `Attachment.ContentType` | string | MIME type (e.g., `application/pdf`) |
| `Attachment.ContentLength` | number | Size in bytes |
| `Attachment.ContentID` | string\|null | Content ID if inline image, else null |

**Important:** `ContentID` is set for inline images (referenced in HTML via `cid:` URL). Regular attachments have `ContentID: null`.

---

## Parsing Examples

### Extract Thread Information

```javascript
const { MailboxHash, Headers, MessageID, InReplyTo } = req.body;

// Get conversation ID from the MailboxHash
const [type, recordId] = MailboxHash.split('-');

// Find In-Reply-To header for threading
const inReplyToHeader = Headers.find(h => h.Name === 'In-Reply-To');
const inReplyToId = inReplyToHeader?.Value;

console.log(`Reply to ${type} #${recordId}`);
console.log(`In-Reply-To: ${inReplyToId}`);
console.log(`This message ID: ${MessageID}`);
```

### Extract Plain Text Reply (No Quotes)

```javascript
const replyText = req.body.StrippedTextReply || req.body.TextBody;
console.log('New reply content:', replyText);
```

### Process Attachments

```javascript
const attachments = req.body.Attachments || [];

attachments.forEach(att => {
  if (att.ContentID) {
    // Inline image
    console.log(`Inline image: ${att.Name} (${att.ContentType})`);
  } else {
    // Regular attachment
    console.log(`Attachment: ${att.Name} (${att.ContentLength} bytes)`);
    
    // Decode base64
    const buffer = Buffer.from(att.Content, 'base64');
    // Save to disk or process
  }
});
```

### Parse MailboxHash for Routing

```javascript
const { MailboxHash } = req.body;

// Pattern: type-id (e.g., "ticket-456", "order-789", "user-123")
const [type, ...idParts] = MailboxHash.split('-');
const id = idParts.join('-'); // Handle IDs with hyphens

switch(type) {
  case 'ticket':
    return updateTicket(id, req.body);
  case 'order':
    return updateOrder(id, req.body);
  case 'user':
    return notifyUser(id, req.body);
  default:
    return createNewRecord(req.body);
}
```

---

## Field Availability

### Always Present

These fields are always in the payload:
- `From`, `FromName`, `To`, `Subject`
- `MessageID`, `MailboxHash` (if using `+` addressing)
- `Date`
- At least one of: `TextBody`, `HtmlBody`

### May Be Missing

These fields may be omitted if not present in the original email:
- `ReplyTo`
- `Cc`, `Bcc` (if no CC/BCC recipients)
- `HtmlBody` (plain text emails)
- `StrippedHtmlReply` (if no HTML version)
- `Headers` (if empty)
- `Attachments` (if no attachments)

**Always check for presence before accessing:**
```javascript
const html = req.body.HtmlBody || '';
const attachments = req.body.Attachments || [];
const cc = req.body.CcFull || [];
```

---

## Large Payload Handling

### Typical Sizes

- **Plain text email**: 1–10 KB
- **With images/attachments**: 100 KB – 5 MB
- **Large PDF attachments**: 5–50 MB

### Set Body Size Limit

```javascript
const express = require('express');
const app = express();

// Allow up to 50 MB for inbound emails with attachments
app.use(express.json({ limit: '50mb' }));
```

### Process Asynchronously

Large payloads should be queued for async processing:

```javascript
app.post('/webhooks/inbound', (req, res) => {
  // Return 200 immediately
  res.sendStatus(200);

  // Queue for async processing
  queue.push({ type: 'inbound_email', payload: req.body });
  
  // Handle later in a worker process
});
```

---

## Content Encoding

### Text Fields

- `TextBody`, `HtmlBody` — UTF-8 encoded strings
- HTML entities are decoded (e.g., `&amp;` → `&`)
- Line breaks preserved (CRLF or LF)

### Attachment Content

- Base64-encoded binary data
- Decode with: `Buffer.from(att.Content, 'base64')`
- ContentLength is the original file size (not base64 size)

### Date Format

- RFC 2822 format: `Thu, 5 Apr 2012 16:59:01 +0200`
- Parse with: `new Date(dateString)`

---

## Quoted Content Examples

### Example 1: Plain Text with Quoted Reply

```
StrippedTextReply:
"Thanks for the update!"

TextBody (full):
"Thanks for the update!

On 2012-04-05, at 14:30, support@yourdomain.com wrote:

> Original issue description here
> More details..."
```

### Example 2: HTML with Quoted Reply

```
StrippedHtmlReply:
"<html><body><p>Thanks for the update!</p></body></html>"

HtmlBody (full):
"<html><body><p>Thanks for the update!</p><blockquote>
<div>Original issue description here</div>
<div>More details...</div>
</blockquote></body></html>"
```

### Why Use Stripped?

Processing `StrippedTextReply` vs `TextBody`:
- **Stripped**: Only the new message (clean for storage/display)
- **Full**: Includes quote history (useful for context, but cluttered)

Use stripped for storing the reply, use full for threading/context.

---

## Header Threading

For email threading, extract these headers:

```javascript
const headers = Object.fromEntries(
  req.body.Headers.map(h => [h.Name, h.Value])
);

const messageId = headers['Message-ID'];
const inReplyTo = headers['In-Reply-To'];
const references = headers['References']; // Space-separated chain

// Build thread: references → inReplyTo → messageId → this message
```

Postmark includes these standard headers automatically.
