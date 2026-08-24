import axios from 'axios';

export interface WhatsAppTemplateComponent {
  type: 'body' | 'header' | 'button';
  parameters?: Array<{ type: 'text'; text: any }>;
  sub_type?: string;
  index?: string;
}

export interface SendWhatsAppInput {
  to: string;
  text?: unknown;
  templateName?: string;
  languageCode?: string;
  components?: WhatsAppTemplateComponent[];
}

function getConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v23.0';
  if (!token || !phoneNumberId) throw new Error('WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  return { token, phoneNumberId, version };
}

export function isWhatsAppConfigured() { return Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()); }

function normalizePhone(value: string) { return value.replace(/[^\d]/g, ''); }
function textValue(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.en === 'string') return candidate.en.trim();
    if (typeof candidate.so === 'string') return candidate.so.trim();
    if (typeof candidate.ar === 'string') return candidate.ar.trim();
  }
  return String(value).trim();
}

export async function sendWhatsAppMessage(input: SendWhatsAppInput) {
  const { token, phoneNumberId, version } = getConfig();
  const to = normalizePhone(input.to);
  if (!to) throw new Error('A valid WhatsApp recipient phone number is required.');
  const payload: Record<string, unknown> = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (input.templateName) {
    payload.type = 'template';
    payload.template = {
      name: input.templateName,
      language: { code: input.languageCode || 'en_US' },
      ...(input.components?.length ? { components: input.components.map((component) => ({ ...component, parameters: component.parameters?.map((parameter) => ({ ...parameter, text: textValue(parameter.text) })) })) } : {}),
    };
  } else {
    const body = textValue(input.text);
    if (!body) throw new Error('Message text is required.');
    payload.type = 'text';
    payload.text = { preview_url: false, body };
  }
  const response = await axios.post(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, payload, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20000 });
  return { providerMessageId: response.data?.messages?.[0]?.id as string | undefined, raw: response.data };
}
