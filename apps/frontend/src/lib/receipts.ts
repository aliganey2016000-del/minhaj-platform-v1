import api from './axios';
import { downloadBlob } from './format';

/**
 * Shared by every "download receipt" button across admin/parent/student
 * pages. With `responseType: 'blob'`, axios gives back a Blob for BOTH
 * success and error responses — an error's real message (e.g. "no receipt
 * for a pending payment", a 403 from a since-transferred student) has to be
 * read out of that Blob as text first, or it's swallowed as an
 * indistinguishable no-op.
 */
export async function downloadReceipt(paymentId: string): Promise<void> {
  try {
    const { data } = await api.get(`/payments/${paymentId}/receipt`, { responseType: 'blob' });
    downloadBlob(data, `receipt-${paymentId}.pdf`);
  } catch (err: any) {
    let message = 'Failed to download receipt';
    const responseData = err?.response?.data;
    if (responseData instanceof Blob) {
      try {
        const text = await responseData.text();
        message = JSON.parse(text)?.message || message;
      } catch { /* not JSON — keep default message */ }
    } else if (responseData?.message) {
      message = responseData.message;
    }
    alert(message);
  }
}

/** A payment only has a real receipt once money has actually moved. */
export function hasReceipt(status: string): boolean {
  return status === 'completed' || status === 'refunded';
}
