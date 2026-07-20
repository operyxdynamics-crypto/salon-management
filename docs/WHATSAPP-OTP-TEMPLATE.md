# WhatsApp OTP template for Meta

## The important thing first

**You cannot write your own OTP message.** Since Meta reclassified one-time passwords, any OTP sent
over WhatsApp must use an **AUTHENTICATION** category template, and the body text of those is fixed
by Meta. Submitting a nicely worded custom message like *"Welcome to Operyx! Your code is 123456"*
will be rejected, or worse, approved as a Utility template and later blocked.

The trade-off is a good one: **authentication templates skip manual review and are approved
instantly.** No waiting.

What you actually choose is limited to:

1. Whether to add the security disclaimer
2. Whether to add the expiry warning
3. Which button — copy-code or one-tap autofill (one is **mandatory**)
4. The language

---

## What Operyx should create

Matching the app's real behaviour: `src/lib/otp-store.ts` issues a **6-digit** code with a
**5-minute** expiry.

| Setting | Value |
|---|---|
| Template name | `operyx_login_code` |
| Category | **AUTHENTICATION** |
| Language | English (`en`) — add `en_GB`/`hi` later if needed |
| Security disclaimer | **On** |
| Expiry warning | **On**, 5 minutes |
| Button | **Copy code** |

### What the customer sees

> **123456** is your verification code. For your security, do not share this code.
>
> This code expires in 5 minutes.
>
> `[ Copy code ]`

The salon's name does not appear in the body and cannot be added — it comes from your verified
WhatsApp Business display name instead. Get that right, because it is the only branding on the
message.

---

## Creating it via the API

```bash
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/message_templates" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "operyx_login_code",
    "language": "en",
    "category": "AUTHENTICATION",
    "components": [
      {
        "type": "BODY",
        "add_security_recommendation": true
      },
      {
        "type": "FOOTER",
        "code_expiration_minutes": 5
      },
      {
        "type": "BUTTONS",
        "buttons": [
          { "type": "OTP", "otp_type": "COPY_CODE", "text": "Copy code" }
        ]
      }
    ]
  }'
```

Note there is no `text` field on the BODY — that is Meta's, not yours.

## Sending a code

The same value goes in **twice**: once for the body, once for the button. This trips people up.

```bash
curl -X POST "https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "919876543210",
    "type": "template",
    "template": {
      "name": "operyx_login_code",
      "language": { "code": "en" },
      "components": [
        { "type": "body", "parameters": [{ "type": "text", "text": "123456" }] },
        {
          "type": "button",
          "sub_type": "url",
          "index": "0",
          "parameters": [{ "type": "text", "text": "123456" }]
        }
      ]
    }
  }'
```

---

## Copy code vs one-tap autofill

**Copy code** is the right choice for Operyx. One-tap autofill only works from a native Android app
— it needs a signature hash and a package name to hand the code straight to your app. Operyx is a
web app (installable, but still web), so autofill has nothing to autofill into. Copy code puts it on
the clipboard, which works everywhere.

---

## Before any of this works

1. **A verified WhatsApp Business Account** with a phone number that is not on personal WhatsApp.
2. **Business verification** with Meta — company documents, and it takes days, so start early.
3. **Authentication messages are charged per message in India**, and the rate is higher than
   utility. At a few OTPs per customer login it is small, but it is a real per-message cost, which
   is why WhatsApp credits are metered rather than unlimited in the Operyx plans.

## Also worth creating (these do need review)

Not OTP, so they are **UTILITY** templates with text you write, and they go through normal approval:

- `operyx_booking_confirmed` — appointment confirmation
- `operyx_booking_reminder` — reminder the day before
- `operyx_invoice_sent` — invoice link after a sale

Those are the ones that actually reduce no-shows. The OTP template only gets someone logged in.
