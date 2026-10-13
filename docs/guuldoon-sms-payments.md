# Guuldoon automatic payment verification (SMS forwarding)

The student registers the wallet number they will pay from (no reference needed), then sends $5 to
the merchant wallet (EVC Plus, Zaad or eDahab) like any normal transfer. The merchant phone forwards
its confirmation SMS to the server, and the subscription of the account that registered that number
activates by itself when the SMS shows **at least $5 marked with `$` or `USD` from that number**,
received no earlier than 30 minutes before the registration. Anything else stays pending for the Super
Admin to verify by hand, exactly as before.

## Set up
1. Pick a long random secret and set `GUULDOON_SMS_WEBHOOK_SECRET` on the backend (Coolify
   environment variable), and `GUULDOON_MERCHANT_NUMBER` to the wallet number students pay (it is
   shown on the student page and can never be used as a payer number), then redeploy. Until it is set the endpoint answers 404.
2. On the phone that **receives** the payments, install an SMS forwarder app that can POST to a URL
   with custom headers (for example "SMS Forwarder" / "SMS to URL" apps for Android).
3. Configure it:
   - URL: `https://<your-api-host>/api/v1/global-subscriptions/sms-webhook`
   - Method `POST`, header `X-Webhook-Secret: <your secret>`, header `Content-Type: application/json`.
     If the app cannot set headers, put the secret in the URL instead: `.../sms-webhook?secret=<your secret>`
   - Body: `{"from":"<sender>","body":"<message text>","receivedAt":"<timestamp>"}`
     (`sender`/`address`, `message`/`text`/`content` and `timestamp`/`date` are accepted too)
   - Forward only the merchant's confirmation messages, and only **received** payments.
4. Do a test payment with a real student account and check that the subscription turns active.

## Rules the server applies
- One SMS activates at most one subscription (`verifiedReference` is `SMS-<id>`, unique).
- Amounts without `$`/`USD` (for example shilling amounts) and amounts under $5 are never auto-approved.
- If two open requests share the same wallet number (for example two grades) they are left for manual
  review; a payment that arrived more than 30 minutes before the request cannot be claimed later.
- Weak spot: someone who registers a classmate's wallet number right after that classmate pays could
  claim the payment. The 30-minute window and one-SMS-one-activation limit keep this small; the Super
  Admin can revoke any auto-approved subscription.
- Forwarded SMS messages are stored for 90 days for matching and audit (`PaymentSms`).
- Auto-approved rows have `autoVerified: true`; the Super Admin can still revoke them.

## Limits
SMS formats differ per provider; if a confirmation does not carry the reference, the payer's number
or a `$` amount, it simply stays for manual review. A direct merchant-API integration (for example
WaafiPay) is the fully automatic alternative and needs merchant credentials.

## Troubleshooting
- Super Admin can open `GET /api/v1/global-subscriptions/sms-webhook/recent` (logged in) to see the last 20
  forwarded messages and whether each one is `matched` or `unmatched`. If a payment is missing there, the
  forwarder did not deliver it; if it is `unmatched`, compare the number and amount with the student's request.
- The backend logs one line per delivery (`[SMS-WEBHOOK] stored=... matched=...`, never the message text).
- Only the first `$` amount in a message counts as the payment; the balance ("haraagagu waa $7.1") is ignored.
- Payloads with unescaped line breaks, plain text and form data are accepted.
- Install the forwarder on the phone that **receives** the payments (the merchant wallet), not on a paying
  phone. Only "received" messages (`... ka heshay ...`) can activate a subscription; receipts for money sent
  (`uwareejisay`), airtime and charges are stored but never match.
