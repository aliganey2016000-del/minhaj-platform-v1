import crypto from 'crypto';
import { phoneCore } from './guuldoon-sms-payment.service';

/**
 * WaafiPay wallet purchase (EVC Plus, Zaad, eDahab, ...). Request shape follows the vendor's
 * public Node SDK (serviceName API_PURCHASE, paymentMethod MWALLET_ACCOUNT); success is
 * responseCode "2001". The student's phone shows a PIN prompt and the call returns once they answer.
 */
export interface WaafiConfig { url: string; merchantUid: string; apiUserId: string; apiKey: string }

const PRODUCTION_URL = 'https://api.waafipay.net/asm';
const DEFAULT_TIMEOUT_MS = 120000;

/** Credentials from the environment, or null when WaafiPay is not configured. */
export function waafiConfig(env: NodeJS.ProcessEnv = process.env): WaafiConfig | null {
  const { WAAFIPAY_MERCHANT_UID: merchantUid, WAAFIPAY_API_USER_ID: apiUserId, WAAFIPAY_API_KEY: apiKey } = env;
  if (!merchantUid || !apiUserId || !apiKey) return null;
  return { url: env.WAAFIPAY_API_URL || PRODUCTION_URL, merchantUid, apiUserId, apiKey };
}

/** Wallet account number in international form (252 + 8 or 9 digits), or null when it is not a plausible Somali number. */
export function toWalletAccount(input: string): string | null {
  const core = phoneCore(input);
  return core.length >= 8 && core.length <= 9 ? `252${core}` : null;
}

export interface PurchaseInput { accountNo: string; amount: number; referenceId: string; invoiceId: string; description: string }
export interface PurchaseResult {
  ok: boolean;
  /** True when the outcome is unknown (network error, timeout, unreadable reply): the wallet may still have been charged. */
  ambiguous: boolean;
  transactionId?: string;
  code?: string;
  message?: string;
}

const timestamp = (date = new Date()) => date.toISOString().replace('T', ' ').slice(0, 19);

export async function purchase(config: WaafiConfig, input: PurchaseInput, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PurchaseResult> {
  const body = {
    schemaVersion: '1.0',
    requestId: crypto.randomUUID(),
    timestamp: timestamp(),
    channelName: 'WEB',
    serviceName: 'API_PURCHASE',
    serviceParams: {
      merchantUid: config.merchantUid,
      apiUserId: config.apiUserId,
      apiKey: config.apiKey,
      paymentMethod: 'MWALLET_ACCOUNT',
      payerInfo: { accountNo: input.accountNo },
      transactionInfo: {
        referenceId: input.referenceId,
        invoiceId: input.invoiceId,
        amount: input.amount.toFixed(2),
        currency: 'USD',
        description: input.description,
      },
    },
  };
  let json: any;
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    json = await response.json();
  } catch {
    return { ok: false, ambiguous: true, message: 'No confirmation received from the payment provider' };
  }
  if (!json || typeof json !== 'object' || typeof json.responseCode === 'undefined') {
    return { ok: false, ambiguous: true, message: 'Unreadable reply from the payment provider' };
  }
  const code = String(json.responseCode);
  const message = typeof json.responseMsg === 'string' ? json.responseMsg.slice(0, 300) : undefined;
  if (code === '2001') {
    const transactionId = json.params?.transactionId ?? json.params?.referenceId;
    // A success without a transaction id cannot be proven or de-duplicated later: leave it for manual review.
    if (!transactionId) return { ok: false, ambiguous: true, code, message: 'Payment reported without a transaction id' };
    return { ok: true, ambiguous: false, transactionId: String(transactionId).slice(0, 80), code, message };
  }
  return { ok: false, ambiguous: false, code, message };
}
