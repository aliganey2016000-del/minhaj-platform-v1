# Guuldoon automatic payment verification (SMS forwarding)

Students pay $5 to the merchant wallet (EVC Plus, Zaad or eDahab), then enter the transaction
reference and the wallet number they paid from. The merchant phone forwards its confirmation SMS to
the server, and the subscription activates by itself when **all three** match: the reference, the
payer's wallet number and an amount of at least **$5 marked with `$` or `USD`**. Anything else stays
pending for the Super Admin to verify by hand, exactly as before.

## Set up
1. Pick a long random secret and set `GUULDOON_SMS_WEBHOOK_SECRET` on the backend (Coolify
   environment variable), then redeploy. Until it is set the endpoint answers 404.
2. On the phone that **receives** the payments, install an SMS forwarder app that can POST to a URL
   with custom headers (for example "SMS Forwarder" / "SMS to URL" apps for Android).
3. Configure it:
   - URL: `https://<your-api-host>/api/v1/global-subscriptions/sms-webhook`
   - Method `POST`, header `X-Webhook-Secret: <your secret>`, header `Content-Type: application/json`
   - Body: `{"from":"<sender>","body":"<message text>","receivedAt":"<timestamp>"}`
     (`sender`/`address`, `message`/`text`/`content` and `timestamp`/`date` are accepted too)
   - Forward only the merchant's confirmation messages, and only **received** payments.
4. Do a test payment with a real student account and check that the subscription turns active.

## Rules the server applies
- A reference can verify one subscription only (`verifiedReference` is unique).
- References shorter than 6 letters/digits, requests with no wallet number, amounts without `$`/`USD`
  (for example shilling amounts) and amounts under $5 are never auto-approved.
- Forwarded SMS messages are stored for 90 days for matching and audit (`PaymentSms`).
- Auto-approved rows have `autoVerified: true`; the Super Admin can still revoke them.

## Limits
SMS formats differ per provider; if a confirmation does not carry the reference, the payer's number
or a `$` amount, it simply stays for manual review. A direct merchant-API integration (for example
WaafiPay) is the fully automatic alternative and needs merchant credentials.
