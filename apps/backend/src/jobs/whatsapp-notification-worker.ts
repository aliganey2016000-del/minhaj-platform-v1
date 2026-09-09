import { processDueWhatsAppNotifications } from '../services/whatsapp-notification.service';

let running = false;

export async function runWhatsAppNotificationWorker() {
  if (running) return;
  running = true;
  try {
    await processDueWhatsAppNotifications(25);
  } catch (error) {
    // A background notification worker must never create an unhandled
    // rejection that terminates the API process. Individual jobs already
    // handle provider failures/retries; this catch protects the polling loop
    // from transient DB/network errors around the queue query itself.
    console.error('[WhatsApp notification worker] tick failed:', error);
  } finally {
    running = false;
  }
}

export function startWhatsAppNotificationWorker(intervalMs = 15000) {
  void runWhatsAppNotificationWorker();
  return setInterval(() => void runWhatsAppNotificationWorker(), intervalMs);
}
