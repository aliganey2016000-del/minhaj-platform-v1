import { processDueWhatsAppNotifications } from '../services/whatsapp-notification.service';

let running = false;

export async function runWhatsAppNotificationWorker() {
  if (running) return;
  running = true;
  try {
    await processDueWhatsAppNotifications(25);
  } finally {
    running = false;
  }
}

export function startWhatsAppNotificationWorker(intervalMs = 15000) {
  void runWhatsAppNotificationWorker();
  return setInterval(() => void runWhatsAppNotificationWorker(), intervalMs);
}
