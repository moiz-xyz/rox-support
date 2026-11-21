# Quick answers

Saved replies for the problems customers ask about again and again. They're matched from what the
customer **types** or from the **screenshot** they send. Everything runs on the backend server: there's
no AI service, no API key, and no per-message cost.

## How a customer message is handled

```
customer message (text and/or screenshot)
  │
  ├─ screenshot → OCR (tesseract.js) reads its text + a picture fingerprint (dHash, sharp)
  │                cached in Redis by file hash, so the same image is never read twice
  │
  ├─ matcher scores every saved answer of the application (0–100 %)
  │     text:    keyword phrases vs. the customer's words (typos, Roman Urdu spellings,
  │              Urdu letter variants and plurals are normalised; rare words count more)
  │     screen:  "words on the screenshot" vs. the OCR text
  │     picture: fingerprint distance to saved screenshots (near-blank screens are ignored)
  │
  ├─ mode OFF      → nothing
  ├─ mode SUGGEST  → agents see "Suggested answer" above the reply box (Send / Edit first)
  └─ mode AUTO     → a confident, approved, unambiguous match is sent as the assistant
                     ("Rox Assistant", violet bubble), otherwise it is a suggestion
```

Automatic replies are skipped when any of these is true. The message then stays a suggestion for the team.

- A human agent replied in the last *N* minutes (default 30).
- The conversation already got the maximum number of automatic replies (default 3).
- The same answer was already sent in this conversation. Asking again means it didn't help.
- The best two answers are within 8 points of each other (ambiguous).
- The answer was saved by an agent and isn't approved by an admin yet.
- The customer typed a hand-over word ("agent", "insaan", "human"…) after an automatic reply. The assistant then posts the hand-over message once and stays quiet in that conversation for 24 h.

Automatic replies don't set the conversation's *first response* time, so agent response stats stay honest.

## Roles

| | Agent | Admin / Super Admin |
|---|---|---|
| See answers, use suggestions, try the tester | ✅ | ✅ |
| **Save as quick answer** from a conversation | ✅ (suggest-only until approved) | ✅ (approved) |
| Edit, delete, approve, import, change settings | — | ✅ |

## Dashboard

- **Quick answers** page, in the sidebar:
  - mode and thresholds
  - assistant name, footer and hand-over words
  - **Try it** tester: type a message or attach a screenshot to see the score and the OCR text
  - the list of answers, with *Export* (JSON backup) and *Import*
- **In a conversation:**
  - the suggestion card above the reply box
  - the **Save as quick answer** button (bookmark icon) in the header, which prefills:
    - the customer's words
    - the text read from their last screenshot and its fingerprint
    - your last reply

## Storage (Redis)

| Key | Content |
|---|---|
| `support:qa:<appId>:items` | hash id → answer JSON |
| `support:qa:<appId>:uses` | hash id → times used |
| `support:qa:<appId>:settings` | settings JSON |
| `support:qa:<appId>:ver` | bumped on every change (matcher cache) |
| `support:qa:owner:<id>` | answer id → application id |
| `support:qa:sugg:<conversationId>` | current suggestion (3 days) |
| `support:qa:conv:<conversationId>:auto/sent/handoff` | per-conversation counters (24 h) |
| `support:qa:img:<sha256>` | OCR text + fingerprint of a screenshot (30 days) |

Keep Redis persistence on (RDB snapshots are on by default on Ubuntu). Use **Export** for backups.

## REST (agents, `/api/support/quick-answers`)

| Method | Path | |
|---|---|---|
| GET | `?applicationId=` | list (with `uses`) |
| POST | `/` | create `{ applicationId, title, answer, phrases[], screenTexts[], imageHashes[], enabled?, approved? }` |
| PATCH / DELETE | `/:id` | admins |
| POST | `/:id/used` | count a use |
| GET / PATCH | `/settings?applicationId=` | PATCH: admins |
| POST | `/test` | multipart `applicationId`, `text?`, `file?` → scores, OCR text, `wouldAutoReply` |
| GET / DELETE | `/conversations/:id/suggestion` | current suggestion / dismiss |
| POST | `/conversations/:id/draft` | prefilled "Save as quick answer" |
| GET | `/export?applicationId=` | JSON backup |
| POST | `/import` | `{ applicationId, items[] }`: admins; adds/updates, never deletes |

## Server cost

- **OCR:** about 0.5–1 s of one CPU core per new screenshot, one at a time. Screenshots beyond
  `SUPPORT_OCR_MAX_QUEUE` (25) waiting are skipped rather than slowing the server.
- **Memory:** the OCR worker uses about 100–150 MB once started.
- **Matching:** milliseconds.
