import axios from 'axios';

function getConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('Telegram is not configured. Set TELEGRAM_BOT_TOKEN.');
  return { token };
}

export function isTelegramConfigured() { return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()); }

// Needed client-side to build the https://t.me/<username>?start=<token> deep
// link — fetching it from Telegram's getMe on every request is unnecessary
// round-tripping, so this is set once as a plain env var alongside the token.
export function getTelegramBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() || null;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const { token } = getConfig();
  const id = String(chatId).trim();
  if (!id) throw new Error('A valid Telegram chat id is required.');
  const body = String(text || '').trim();
  if (!body) throw new Error('Message text is required.');
  // No parse_mode — sent as plain text so arbitrary admin/automation text
  // (names, course titles) never has to be HTML/Markdown-escaped first.
  const response = await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    { chat_id: id, text: body },
    { timeout: 20000 }
  );
  return { providerMessageId: response.data?.result?.message_id ? String(response.data.result.message_id) : undefined, raw: response.data };
}
