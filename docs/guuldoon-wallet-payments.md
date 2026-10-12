# Guuldoon wallet payment (WaafiPay: EVC Plus, Zaad, eDahab)

The student enters the wallet number, taps **Bixi $5 hadda**, and confirms the PIN prompt on their
phone. On success the subscription activates for 365 days. The button only appears when the three
credentials below are set. The manual reference form and SMS auto-verify keep working.

## Switch it on
1. Open a WaafiPay merchant account (Hormuud / WaafiPay) and ask for API access: `merchantUid`,
   `apiUserId` and `apiKey`. Ask for the sandbox first.
2. Set `WAAFIPAY_MERCHANT_UID`, `WAAFIPAY_API_USER_ID`, `WAAFIPAY_API_KEY` on the backend (Coolify
   environment variables). For testing also set `WAAFIPAY_API_URL=https://sandbox.waafipay.net/asm`;
   leave it unset for production (`https://api.waafipay.net/asm`). Redeploy.
3. Make a test payment with a real student account. Check the subscription turns active and the
   transaction appears in the WaafiPay merchant portal.

## What the server does
- Sends `API_PURCHASE` (`MWALLET_ACCOUNT`, $5.00 USD). Only response code `2001` with a transaction
  id activates the subscription; the id is stored as `verifiedReference` (`WAAFI-<id>`) and can never
  activate a second subscription.
- Declined payments mark the request `rejected`, so the student can simply try again.
- If no clear answer comes back (timeout or unreadable reply) the request stays `pending`: money may
  have moved, so it is never rejected. The Super Admin checks the merchant statement and approves it
  from the Subscriptions page.
- 5 attempts per minute per student; the API key is never sent to the browser.

## Not verified
The request format follows the vendor's public Node SDK; the live gateway was not available here.
Check the sandbox once, especially the success response (`responseCode` 2001, `params.transactionId`).
