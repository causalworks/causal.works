# Postmark Webhook Retry Schedule

Applies to both **inbound** webhooks and **outbound event** webhooks.

If your endpoint returns a non-200 status, Postmark retries up to **10 times** over ~10.5 hours:

| Retry | Interval After Previous Attempt |
|-------|--------------------------------|
| 1     | 1 minute                       |
| 2     | 5 minutes                      |
| 3     | 10 minutes                     |
| 4     | 10 minutes                     |
| 5     | 10 minutes                     |
| 6     | 15 minutes                     |
| 7     | 30 minutes                     |
| 8     | 1 hour                         |
| 9     | 2 hours                        |
| 10    | 6 hours                        |

**Critical:** A **403 response immediately stops all retries** — Postmark interprets 403 as intentional rejection. Use 401 for auth failures (retried); use 403 only when you want to permanently stop delivery for that message.

After all retries are exhausted, the message is marked "Failed" and appears in your activity log. You can manually retry via the API (`PUT /messages/inbound/{messageid}/retry` for inbound; use the Messages API for outbound).
