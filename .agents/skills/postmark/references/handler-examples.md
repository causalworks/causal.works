# Inbound Webhook Handler Examples

Complete working examples for processing inbound emails in Node.js and Python.

---

## Node.js: Basic Endpoint

```javascript
const express = require('express');
const app = express();

app.use(express.json({ limit: '50mb' }));

app.post('/webhooks/inbound', (req, res) => {
  // Always respond 200 immediately
  res.sendStatus(200);

  const { From, Subject, MailboxHash, StrippedTextReply } = req.body;

  console.log(`Email from ${From}: ${Subject}`);
  
  if (MailboxHash) {
    console.log(`  → Routed to: ${MailboxHash}`);
  }
  
  console.log(`  → Reply: ${StrippedTextReply?.substring(0, 100)}`);
});

app.listen(3000, () => console.log('Listening on port 3000'));
```

---

## Node.js: Reply-by-Email (Threading)

Thread replies back to tickets/conversations using MailboxHash:

```javascript
const express = require('express');
const db = require('./db'); // Your database
const app = express();

app.use(express.json({ limit: '50mb' }));

app.post('/webhooks/inbound', (req, res) => {
  res.sendStatus(200);
  
  // Parse immediately, process async
  handleInboundEmail(req.body).catch(err => {
    console.error('Async inbound error:', err);
  });
});

async function handleInboundEmail(payload) {
  const { From, Subject, MailboxHash, StrippedTextReply, MessageID, Date } = payload;

  if (!MailboxHash) {
    // New email (no threading)
    console.log(`New email from ${From}: ${Subject}`);
    return;
  }

  // Parse ticket ID from MailboxHash
  const ticketId = parseInt(MailboxHash); // "123" → 123
  
  if (isNaN(ticketId)) {
    console.error(`Invalid MailboxHash: ${MailboxHash}`);
    return;
  }

  // Find the ticket
  const ticket = await db.query(
    'SELECT * FROM tickets WHERE id = $1',
    [ticketId]
  );

  if (ticket.rows.length === 0) {
    console.log(`Ticket ${ticketId} not found`);
    return;
  }

  // Add reply to the ticket
  await db.query(
    `INSERT INTO ticket_replies (ticket_id, from_email, reply_text, message_id, received_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketId, From, StrippedTextReply, MessageID, new Date(Date)]
  );

  console.log(`Reply added to ticket ${ticketId}`);
}

app.listen(3000);
```

---

## Node.js: With Attachment Processing

Handle file attachments and inline images:

```javascript
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const db = require('./db');
const app = express();

app.use(express.json({ limit: '50mb' }));

app.post('/webhooks/inbound', (req, res) => {
  res.sendStatus(200);
  processEmail(req.body).catch(err => console.error(err));
});

async function processEmail(payload) {
  const { From, MailboxHash, StrippedTextReply, Attachments } = payload;
  const ticketId = parseInt(MailboxHash);

  // Save reply
  const result = await db.query(
    `INSERT INTO ticket_replies (ticket_id, from_email, reply_text)
     VALUES ($1, $2, $3) RETURNING id`,
    [ticketId, From, StrippedTextReply]
  );
  const replyId = result.rows[0].id;

  // Process attachments
  if (Attachments && Attachments.length > 0) {
    for (const att of Attachments) {
      if (att.ContentID) {
        // Inline image — store for display
        await saveInlineImage(replyId, att);
      } else {
        // Regular attachment — store for download
        await saveAttachment(replyId, att);
      }
    }
  }
}

async function saveAttachment(replyId, attachment) {
  const { Name, Content, ContentLength } = attachment;
  
  // Decode base64
  const buffer = Buffer.from(Content, 'base64');
  
  // Save to disk
  const uploadDir = path.join(__dirname, 'uploads', String(replyId));
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, Name), buffer);
  
  // Record in database
  await db.query(
    `INSERT INTO ticket_attachments (reply_id, filename, size, path)
     VALUES ($1, $2, $3, $4)`,
    [replyId, Name, ContentLength, path.join(uploadDir, Name)]
  );
  
  console.log(`  Saved attachment: ${Name} (${ContentLength} bytes)`);
}

async function saveInlineImage(replyId, attachment) {
  const { Name, Content, ContentID } = attachment;
  const buffer = Buffer.from(Content, 'base64');
  
  // Store inline images separately for HTML reference
  const uploadDir = path.join(__dirname, 'inline-images', String(replyId));
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, Name), buffer);
  
  // Record in database with ContentID for HTML cid: reference
  await db.query(
    `INSERT INTO ticket_inline_images (reply_id, content_id, filename, path)
     VALUES ($1, $2, $3, $4)`,
    [replyId, ContentID, Name, path.join(uploadDir, Name)]
  );
  
  console.log(`  Saved inline image: ${Name} (cid: ${ContentID})`);
}

app.listen(3000);
```

---

## Node.js: Async Processing with Queue

For high-volume emails, queue processing instead of handling synchronously:

```javascript
const express = require('express');
const Queue = require('bull'); // Redis-backed job queue
const app = express();

app.use(express.json({ limit: '50mb' }));

// Create a job queue
const emailQueue = new Queue('inbound-emails', {
  redis: {
    host: 'localhost',
    port: 6379
  }
});

// Process jobs in the background
emailQueue.process(async (job) => {
  const payload = job.data;
  console.log(`Processing email from ${payload.From}`);
  
  // Your processing logic
  const ticketId = parseInt(payload.MailboxHash);
  await saveReply(ticketId, payload);
  
  return { success: true };
});

// Handle errors
emailQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

// Webhook endpoint
app.post('/webhooks/inbound', async (req, res) => {
  // Immediately respond 200
  res.sendStatus(200);
  
  // Queue the work
  try {
    await emailQueue.add(req.body, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    console.log('Email queued for processing');
  } catch (error) {
    console.error('Failed to queue email:', error);
  }
});

app.listen(3000);
```

---

## Node.js: Deduplication

Prevent duplicate processing of the same message:

```javascript
const express = require('express');
const db = require('./db');
const app = express();

app.use(express.json({ limit: '50mb' }));

app.post('/webhooks/inbound', (req, res) => {
  res.sendStatus(200);
  processEmail(req.body).catch(err => console.error(err));
});

async function processEmail(payload) {
  const { MessageID, From, MailboxHash, StrippedTextReply } = payload;

  // Check if we've already processed this MessageID
  const existing = await db.query(
    'SELECT id FROM ticket_replies WHERE message_id = $1',
    [MessageID]
  );

  if (existing.rows.length > 0) {
    console.log(`Duplicate: MessageID ${MessageID} already processed`);
    return; // Silently ignore
  }

  // Process as normal
  const ticketId = parseInt(MailboxHash);
  await db.query(
    `INSERT INTO ticket_replies (ticket_id, from_email, reply_text, message_id)
     VALUES ($1, $2, $3, $4)`,
    [ticketId, From, StrippedTextReply, MessageID]
  );

  console.log(`Processed MessageID ${MessageID}`);
}

app.listen(3000);
```

---

## Node.js: Validation & Error Handling

Robust handler with input validation:

```javascript
const express = require('express');
const app = express();

app.use(express.json({ limit: '50mb' }));

app.post('/webhooks/inbound', (req, res) => {
  // Validate webhook source
  if (!verifyWebhookAuth(req)) {
    console.warn('Unauthorized webhook request');
    return res.sendStatus(401);
  }

  res.sendStatus(200);
  
  try {
    processEmail(req.body).catch(err => {
      console.error('Async processing error:', err);
    });
  } catch (error) {
    // Log but don't fail — Postmark has no retry on 200
    console.error('Immediate processing error:', error);
  }
});

function verifyWebhookAuth(req) {
  // Check HTTP Basic Auth (if configured in Postmark)
  const auth = req.get('authorization');
  
  if (!auth) {
    return false;
  }

  const [scheme, credentials] = auth.split(' ');
  
  if (scheme !== 'Basic') {
    return false;
  }

  const decoded = Buffer.from(credentials, 'base64').toString();
  const [username, password] = decoded.split(':');

  // Verify against stored credentials
  return username === process.env.WEBHOOK_USER &&
         password === process.env.WEBHOOK_PASS;
}

async function processEmail(payload) {
  // Validate required fields
  if (!payload.From) {
    throw new Error('Missing From field');
  }

  if (!payload.MessageID) {
    throw new Error('Missing MessageID');
  }

  // Extract fields with defaults
  const { From, Subject = '(no subject)', MailboxHash, StrippedTextReply = '' } = payload;

  // Handle missing MailboxHash
  if (!MailboxHash) {
    console.log(`New email from ${From}: ${Subject}`);
    return; // Not a reply, skip
  }

  // Validate MailboxHash format
  const ticketId = parseInt(MailboxHash);
  
  if (isNaN(ticketId)) {
    console.error(`Invalid MailboxHash format: ${MailboxHash}`);
    return;
  }

  // Process
  console.log(`Replying to ticket ${ticketId}`);
}

app.listen(3000);
```

---

## Python: Basic Endpoint

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/webhooks/inbound', methods=['POST'])
def handle_inbound():
    payload = request.get_json()
    
    from_email = payload.get('From')
    subject = payload.get('Subject')
    mailbox_hash = payload.get('MailboxHash')
    reply_text = payload.get('StrippedTextReply')
    
    print(f"Email from {from_email}: {subject}")
    
    if mailbox_hash:
        print(f"  → Routed to: {mailbox_hash}")
    
    # Return 200 immediately
    return '', 200

if __name__ == '__main__':
    app.run(port=3000)
```

---

## Python: With Database & Async

```python
from flask import Flask, request
import asyncio
from db import connect_db
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/webhooks/inbound', methods=['POST'])
def handle_inbound():
    payload = request.get_json()
    
    # Return 200 immediately
    response = jsonify({'status': 'received'})
    response.status_code = 200
    
    # Process asynchronously in background
    asyncio.create_task(process_email_async(payload))
    
    return response

async def process_email_async(payload):
    try:
        from_email = payload.get('From')
        mailbox_hash = payload.get('MailboxHash')
        reply_text = payload.get('StrippedTextReply', '')
        message_id = payload.get('MessageID')
        
        if not mailbox_hash:
            logger.info(f"New email from {from_email}, no threading")
            return
        
        # Parse ticket ID
        ticket_id = int(mailbox_hash)
        
        # Connect to database
        async with connect_db() as db:
            # Check for duplicates
            existing = await db.fetchval(
                'SELECT id FROM ticket_replies WHERE message_id = $1',
                message_id
            )
            
            if existing:
                logger.info(f"Duplicate: {message_id}")
                return
            
            # Insert reply
            await db.execute(
                '''INSERT INTO ticket_replies 
                   (ticket_id, from_email, reply_text, message_id)
                   VALUES ($1, $2, $3, $4)''',
                ticket_id, from_email, reply_text, message_id
            )
            
            logger.info(f"Reply added to ticket {ticket_id}")
    
    except Exception as e:
        logger.error(f"Error processing email: {e}")

if __name__ == '__main__':
    app.run(port=3000)
```

---

## Express Middleware for Auth

```javascript
const express = require('express');

// Middleware to verify Postmark webhook
function verifyPostmarkWebhook(req, res, next) {
  const auth = req.get('authorization');
  
  if (!auth) {
    return res.sendStatus(401);
  }

  const [scheme, credentials] = auth.split(' ');
  
  if (scheme !== 'Basic') {
    return res.sendStatus(401);
  }

  const decoded = Buffer.from(credentials, 'base64').toString();
  const [username, password] = decoded.split(':');

  const validUser = process.env.WEBHOOK_USER;
  const validPass = process.env.WEBHOOK_PASS;

  if (username === validUser && password === validPass) {
    next();
  } else {
    res.sendStatus(401);
  }
}

const app = express();
app.use(express.json({ limit: '50mb' }));

// Protect the webhook endpoint
app.post('/webhooks/inbound', verifyPostmarkWebhook, (req, res) => {
  res.sendStatus(200);
  handleEmail(req.body).catch(err => console.error(err));
});

async function handleEmail(payload) {
  // Your processing logic
}

app.listen(3000);
```

---

## Complete Example: Express + Database

Full integration with database and error handling:

```javascript
const express = require('express');
const { Pool } = require('pg');
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(express.json({ limit: '50mb' }));

// Verify webhook authentication
app.use('/webhooks/inbound', (req, res, next) => {
  const auth = req.get('authorization');
  if (!auth || !verifyAuth(auth)) {
    return res.sendStatus(401);
  }
  next();
});

function verifyAuth(authHeader) {
  try {
    const [scheme, credentials] = authHeader.split(' ');
    const decoded = Buffer.from(credentials, 'base64').toString();
    const [user, pass] = decoded.split(':');
    return user === process.env.WEBHOOK_USER && pass === process.env.WEBHOOK_PASS;
  } catch (e) {
    return false;
  }
}

app.post('/webhooks/inbound', (req, res) => {
  res.sendStatus(200);
  
  handleInbound(req.body).catch(err => {
    console.error('Inbound processing error:', err);
  });
});

async function handleInbound(payload) {
  const { MessageID, From, MailboxHash, Subject, StrippedTextReply, Date } = payload;

  // Validate
  if (!From || !MessageID) {
    console.warn('Invalid payload: missing From or MessageID');
    return;
  }

  // Check for duplicate
  const existing = await pool.query(
    'SELECT 1 FROM inbound_messages WHERE message_id = $1',
    [MessageID]
  );

  if (existing.rows.length > 0) {
    console.log(`Skipping duplicate: ${MessageID}`);
    return;
  }

  // Handle new email vs. reply
  if (!MailboxHash) {
    console.log(`New email from ${From}: ${Subject}`);
    await saveNewConversation(payload);
  } else {
    console.log(`Reply to ${MailboxHash} from ${From}`);
    await saveReply(MailboxHash, payload);
  }

  // Log the inbound message
  await pool.query(
    `INSERT INTO inbound_messages (message_id, from_email, received_at)
     VALUES ($1, $2, $3)`,
    [MessageID, From, new Date(Date)]
  );
}

async function saveNewConversation(payload) {
  const { From, Subject, StrippedTextReply } = payload;
  
  await pool.query(
    `INSERT INTO conversations (from_email, subject, first_message, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [From, Subject, StrippedTextReply]
  );
}

async function saveReply(mailboxHash, payload) {
  const ticketId = parseInt(mailboxHash);
  const { From, StrippedTextReply } = payload;
  
  await pool.query(
    `INSERT INTO replies (ticket_id, from_email, message, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [ticketId, From, StrippedTextReply]
  );
}

app.listen(process.env.PORT || 3000);
```
