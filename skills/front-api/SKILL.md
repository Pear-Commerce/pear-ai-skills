---
name: front-api
description: Query Pear's Front shared inbox (customer success / implementation email) via the Front API from a terminal. Use when investigating what a customer or brand has said over email, gathering vendor conversation history and sentiment before responding, finding email threads referenced in Slack questions, checking support ticket context ([Pear Commerce] Update on ISS/TKT threads), or debugging a customer issue where the original complaint may live in Front rather than Slack.
---

# Front API

Pear's customer-facing email (success@pearcommerce.com, implementation threads, support-ticket notifications, Gong/meeting recaps) lives in **Front**. The Front API gives read access to every conversation so an agent can answer "what has customer X said about Y" without asking CS to forward threads.

Base URL: `https://api2.frontapp.com` — auth is a single Bearer token (company API token).

## Setup — get an API key

Front API tokens are created per-user under company settings:

1. Open Front → **Settings** (gear, bottom left) → **Company** → **Developers** → **API Tokens**.
2. **Create token** → name it (e.g. `local-agent-<yourname>`) → leave scopes default (full read) → copy the token immediately; it is only shown once.
3. Only **company admins** see the Developers section. If you don't see it, **message Jon Kane** (or another Front admin) and ask for a company API token for local agent use.

Store it following the Pear local-env convention (`~/.pear/<service>.env` sourced from `~/.zshrc`):

```bash
mkdir -p ~/.pear && chmod 700 ~/.pear
cat > ~/.pear/front.env <<'EOF'
export FRONT_API_TOKEN="<paste token here>"
EOF
chmod 600 ~/.pear/front.env
echo '[ -f "$HOME/.pear/front.env" ] && source "$HOME/.pear/front.env"' >> ~/.zshrc
source ~/.pear/front.env
```

Verify:

```bash
curl -s -H "Authorization: Bearer $FRONT_API_TOKEN" https://api2.frontapp.com/me
# -> {"_links":{"self":"https://pear.api.frontapp.com/me"},"name":"Pear","id":"cmp_..."}
```

## Searching conversations

```bash
# URL-encode the query; returns up to 50 conversations per page
curl -s -H "Authorization: Bearer $FRONT_API_TOKEN" \
  "https://api2.frontapp.com/conversations/search/dude%20wipes" \
  | jq -r '._results[] | [.id, (.created_at|todate)[0:10], .status, .subject] | @tsv'
```

Notes:

- Search matches subject **and** body, so it also surfaces newsletters and automated mail (Gong recaps, HubSpot deal alerts, ticket notifications). Filter by subject/sender, and prefer threads with real customer addresses (e.g. `@dudeproducts.com`).
- Paginate with `._pagination.next` until it is null:

```bash
url="https://api2.frontapp.com/conversations/search/$QUERY"
while [ -n "$url" ]; do
  resp=$(curl -s -H "Authorization: Bearer $FRONT_API_TOKEN" "$url")
  echo "$resp" | jq -c '._results[]'
  url=$(echo "$resp" | jq -r '._pagination.next // empty')
done
```

## Reading a conversation's messages

```bash
curl -s -H "Authorization: Bearer $FRONT_API_TOKEN" \
  "https://api2.frontapp.com/conversations/<cnv_id>/messages" \
  | jq -r '._results[] | (.author.username // "?") + ": " + (.body // "" | .[0:500])'
```

Gotchas:

- **`body` is HTML** — strip tags before reading (`gsub("<[^>]*>"; " ")` in jq, or `re.sub(r"<[^>]*>", " ", body)` in Python). Long email threads quote the entire history inline, so bodies can be huge; conversations with 50+ messages can be 10MB+ of JSON. Fetch to a file, then process with Python rather than piping giant bodies through jq repeatedly.
- **`date` is epoch seconds** (number), not ISO — `(.date | todate)` in jq or `datetime.utcfromtimestamp()` in Python.
- Messages paginate at 50/page via `._pagination.next` like conversations.
- `.author` is null for inbound customer mail in some views; use recipients/handles when you need the sender, and infer the customer side from quoted `wrote:` lines inside the body.
- Useful related endpoints: `GET /conversations/<id>/comments` (internal Front comments — often where CS tags teammates), `GET /contacts/search/<email>`, `GET /inboxes`.

## What lives here (Pear specifics)

- **Implementation threads** — vendor onboarding emails with success@pearcommerce.com (PDP mappings, pixel setup, widget config).
- **Ticket notifications** — subjects like `[Pear Commerce] Update on ISS - ...` / `TKT - ...` mirror dashboard support tickets into email.
- **Meeting recaps** — Gong "Call recording and analysis is ready" threads.
- **Recurring customer complaints** — e.g. a brand repeatedly raising interstitial load time; searching the brand name surfaces every escalation, which is exactly the context needed before answering a Slack question about that brand.

## Rules

- **Read-only by default.** Never send, archive, assign, or delete mail through the API unless the user explicitly asks for that action.
- Don't paste the token into code that gets committed, and don't echo it into logs. Reference `$FRONT_API_TOKEN` from the environment.
- When summarizing customer email for Slack, quote sparingly and attribute (name + date) — these are customer comms.
