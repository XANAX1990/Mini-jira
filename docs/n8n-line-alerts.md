# Mini Jira → n8n → LINE alerts

Mini Jira can POST a small signed message to an n8n webhook when a **high-priority** issue appears: an issue **created as high**, or an existing issue whose priority is **raised to high**. Medium and low issues send nothing. This guide builds the n8n side: **Webhook → verify the signature → LINE push message**.

> **What was tested.** The Mini Jira side (signing, timeout, never blocking, silent skip) is covered by unit tests and was run against a local stand-in for n8n. Every expression below was run in plain JavaScript against the exact data shape n8n's Webhook node produces. The owner ran the whole chain (Mini Jira → n8n → LINE) end to end with a separate LINE Official Account. Node option names can differ a little between n8n versions; if a label does not match, look for the closest one.

## 1. What Mini Jira sends

`POST <N8N_WEBHOOK_URL>` with `Content-Type: application/json`, a 3 second timeout, and this header:

```
X-Signature: sha256=<hex>        # HMAC-SHA256 of the request body, key = N8N_WEBHOOK_SECRET
```

Body (one line of JSON, keys in this order):

```json
{
  "event": "issue.created",
  "label": "🆕 New HIGH issue",
  "projectKey": "MJ",
  "number": 12,
  "title": "Login redirects to a blank page",
  "priority": "high",
  "assignee": "Ann",
  "url": "https://mini-jira-tan.vercel.app/projects/MJ/issues/12",
  "sentAt": "2026-10-23T08:00:00.000Z"
}
```

- `event` is `issue.created` (only when the issue is created with priority high) or `issue.priority_high` (the priority changed *to* high; saving an issue that was already high sends nothing). Creating a medium or low issue sends nothing.
- `label` is ready-to-show wording for the event: `🆕 New HIGH issue` or `🔴 Raised to HIGH`. Show it instead of translating `event` yourself.
- `assignee` is the display name, or `null` when unassigned.
- `sentAt` is inside the signed body so the receiver can refuse old copies.
- It is fire-and-forget: if n8n is slow, down or answers an error, Mini Jira still saves the issue and only logs one line. **No retries**: a message sent while n8n (or ngrok, or your PC) is off is lost.

## 2. Prepare

1. **A shared secret.** Make one and keep it for both sides:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **ngrok with a fixed address** (so the URL does not change every time). Claim a free static domain in the ngrok dashboard, then:
   ```
   ngrok http --url=your-name.ngrok-free.app 5678
   ```
   (older ngrok versions use `--domain=` instead of `--url=`). 5678 is n8n's default port.
3. **Start n8n knowing its public address**, otherwise it shows `localhost` URLs in the editor:
   ```
   # PowerShell
   $env:WEBHOOK_URL="https://your-name.ngrok-free.app/"; npx n8n
   ```
4. **LINE.** LINE Notify was shut down on 31 March 2025, so use the **Messaging API**:
   - [LINE Developers Console](https://developers.line.biz/console/) → create a Provider → create a **Messaging API** channel (this also creates a LINE Official Account).
   - *Messaging API* tab: scan the QR code with your phone to **add the bot as a friend** (push messages to you fail otherwise), then issue a **Channel access token (long-lived)**.
   - *Basic settings* tab: copy **Your user ID** (starts with `U`). This is the `to` of the push message.
   - **A user ID belongs to one provider.** The same person has a different `U...` ID under every provider, so an ID copied from another channel or provider fails with `400`. Copy it from the channel you push with.
   - **A separate Official Account needs its own credential.** If alerts go to a different OA than your other n8n workflows, create a new channel access token and a new Header Auth credential for it in n8n; reusing the old credential sends from the wrong bot (or gets `401`).
   - Push messages count against your plan's monthly message quota; check what your plan includes.

## 3. The workflow (4 nodes)

Create a workflow, then add the nodes in this order and connect them left to right.

### Node 1: Webhook

| Setting | Value |
|---|---|
| HTTP Method | `POST` |
| Path | `mini-jira` |
| Authentication | `None` (the signature is the authentication) |
| Respond | `Immediately` |

Its **Production URL** is `https://your-name.ngrok-free.app/webhook/mini-jira`. The **Test URL** (`/webhook-test/...`) only works while the editor is listening for a test event; the production URL only works once the workflow is **Active** (switch at the top right).

Save is not Publish: in newer n8n versions, **Save** only stores the editor's draft. The production URL runs the **published** version, so after every change click **Publish** (older versions: the Active switch). An edit that was saved but not published is the usual reason "my change has no effect".

The node outputs one item shaped like `{ headers, params, query, body }`, with header names in lower case.

### Node 2: Crypto (recompute the signature)

| Setting | Value |
|---|---|
| Action | `Hmac` |
| Type | `SHA256` |
| Value | `{{ JSON.stringify($json.body) }}` |
| Property Name | `signature` |
| Secret | the shared secret from step 2.1 |
| Encoding | `hex` |

n8n gives you the *parsed* body, so this re-serializes it. That produces the same text Mini Jira signed (checked for Thai text, emoji, quotes, backslashes and line breaks). The node adds `signature` to the item and keeps `headers` and `body`.

### Node 3: IF (accept only a genuine, fresh message)

One condition, type **Boolean**, *is true*:

```
{{ 'sha256=' + $json.signature === $json.headers['x-signature'] && Date.now() - new Date($json.body.sentAt).getTime() < 300000 }}
```

- The first half is the signature check. A changed title or priority, a missing header, or a signature made with another secret all give `false`.
- The second half rejects anything older than 5 minutes (300000 ms), so a captured request cannot be replayed later. A timestamp slightly in the future (clock skew) is still accepted.
- Connect only the **true** output onward. Leave **false** unconnected: the message is dropped. (The Webhook node has already answered `200`, so a forger learns nothing.)

### Node 4: HTTP Request (LINE push)

| Setting | Value |
|---|---|
| Method | `POST` |
| URL | `https://api.line.me/v2/bot/message/push` |
| Authentication | *Generic Credential Type* → *Header Auth*. Create a credential: Name `Authorization`, Value `Bearer <your channel access token>` |
| Send Body | on, Body Content Type `JSON`, Specify Body `Using JSON` |

JSON (switch the field to *Expression*), with your own user ID in `to`:

```
{{ JSON.stringify({ to: 'Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', messages: [{ type: 'text', text: $json.body.label + '\n' + $json.body.projectKey + '-' + $json.body.number + ' ' + $json.body.title + '\nPriority: ' + $json.body.priority + '\nAssignee: ' + ($json.body.assignee || 'Unassigned') + '\n' + $json.body.url }] }) }}
```

The text comes out as:

```
🆕 New HIGH issue
MJ-12 Login redirects to a blank page
Priority: high
Assignee: Ann
https://mini-jira-tan.vercel.app/projects/MJ/issues/12
```

(A raise starts with `🔴 Raised to HIGH`.) A LINE text message can hold 5000 characters; a title is at most 200.

Keep the LINE token in the credential, not typed into the node, so it stays out of exported workflows.

## 4. Test the workflow without Mini Jira

Activate the workflow (or use the Test URL while "Listen for test event" is on) and send a correctly signed message from your own machine:

```
node -e "const c=require('crypto');const [s,u]=process.argv.slice(1);const b=JSON.stringify({event:'issue.created',label:'🆕 New HIGH issue',projectKey:'MJ',number:1,title:'Test alert',priority:'high',assignee:null,url:'https://example.com/projects/MJ/issues/1',sentAt:new Date().toISOString()});fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-Signature':'sha256='+c.createHmac('sha256',s).update(b).digest('hex')},body:b}).then(r=>console.log('HTTP',r.status))" "YOUR_SECRET" "https://your-name.ngrok-free.app/webhook/mini-jira"
```

You should see `HTTP 200`, one execution in n8n that reaches the HTTP Request node, and a LINE message. Run it again with a wrong secret: the execution should stop at the IF node.

## 5. Connect Mini Jira

| Variable | Local `.env.local` | Vercel |
|---|---|---|
| `N8N_WEBHOOK_URL` | `http://localhost:5678/webhook/mini-jira` (no ngrok needed on your own machine) | `https://your-name.ngrok-free.app/webhook/mini-jira` |
| `N8N_WEBHOOK_SECRET` | the shared secret | the same secret |
| `APP_URL` (optional) | leave empty | `https://mini-jira-tan.vercel.app` (the link in the alert; on Vercel the production domain is used anyway if this is empty) |

In Vercel, put the name in **Key** and only the value in **Value**, then **redeploy** so the new values are used. Restart `npm run dev` after editing `.env.local`.

Then create an issue with priority **high** in Mini Jira: a LINE message should arrive within a couple of seconds. Raise an issue from medium to high: another one. Create a medium or low issue, edit a title or move a card: none.

If `N8N_WEBHOOK_URL` is empty, Mini Jira does nothing and logs nothing, so the app works normally while your PC is off.

## 6. When it does not work

| What you see | Likely cause |
|---|---|
| No alert, but the app works | The priority was already high (only a change *to* high alerts), or the issue was created as medium/low |
| Nothing in n8n at all | n8n or ngrok is not running; the workflow is not **Published/Active** (production URL), or your last edit was saved but not published; the URL in Vercel still has the old ngrok address; Vercel was not redeployed after adding the variables |
| n8n execution stops at the IF node | The secret differs between Mini Jira and the Crypto node (watch for spaces or a copied `KEY=`); the Crypto node's *Value* is not `JSON.stringify($json.body)`; your PC clock is more than 5 minutes off |
| IF passes, LINE answers an error | `401`: wrong or expired channel access token, or the credential belongs to another Official Account. `400`: bad body, or a user ID from another provider. The bot must be a friend of the `to` user |
| n8n stops responding while running in a Windows console | The console's QuickEdit mode froze it: clicking in the window selects text and pauses the process until you press Enter or Esc. Turn QuickEdit off (window properties) or run n8n so nobody clicks in it |
| Vercel log: `[n8n] webhook failed: TimeoutError` | n8n answered too slowly or is off. Expected while the PC is off |
| Vercel log: `[n8n] webhook answered HTTP 4xx/5xx` | n8n is reachable but refused it; look at the n8n execution list |
| Vercel log: `N8N_WEBHOOK_URL is set but N8N_WEBHOOK_SECRET is not` | Set the secret; Mini Jira never sends an unsigned message |

## 7. Good to know

- The ngrok address is public: anyone who finds it can POST to it. That is why the first thing the workflow does is check the signature and the age.
- Titles are typed by users. The workflow only puts them into a text message; do not feed them to anything that executes text.
- To change the secret: change it in Vercel (and `.env.local`) and in the Crypto node together.
