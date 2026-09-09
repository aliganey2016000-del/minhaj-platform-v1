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
  organizationId?: string;
}

function getMetaConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v23.0';
  if (!token || !phoneNumberId) throw new Error('WhatsApp Cloud API is not configured.');
  return { token, phoneNumberId, version };
}

function getBaileysConfig() {
  const baseUrl = process.env.WHATSAPP_BAILEYS_SERVICE_URL?.trim();
  const token = process.env.WHATSAPP_BAILEYS_SERVICE_TOKEN?.trim();
  if (!baseUrl || !token) throw new Error('WhatsApp Baileys service is not configured.');
  return { baseUrl: baseUrl.replace(/\/$/, ''), token };
}

export function getWhatsAppProvider() {
  return process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() === 'baileys' ? 'Baileys' : 'Meta WhatsApp Cloud API';
}

export function isWhatsAppConfigured() {
  if (getWhatsAppProvider() === 'Baileys') {
    return Boolean(process.env.WHATSAPP_BAILEYS_SERVICE_URL?.trim() && process.env.WHATSAPP_BAILEYS_SERVICE_TOKEN?.trim());
  }
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
}

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

async function sendViaBaileys(input: SendWhatsAppInput) {
  if (!input.organizationId) throw new Error('organizationId is required for the Baileys WhatsApp provider.');
  const { baseUrl, token } = getBaileysConfig();
  const body = textValue(input.text);
  if (!body) throw new Error('Message text is required.');
  const response = await axios.post(
    `${baseUrl}/v1/accounts/${encodeURIComponent(input.organizationId)}/send`,
    { to: normalizePhone(input.to), text: body },
    { headers: { 'x-whatsapp-service-token': token }, timeout: 20000 },
  );
  return { providerMessageId: response.data?.data?.providerMessageId as string | undefined, raw: response.data };
}

async function sendViaMeta(input: SendWhatsAppInput) {
  const { token, phoneNumberId, version } = getMetaConfig();
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

export async function sendWhatsAppMessage(input: SendWhatsAppInput) {
  return getWhatsAppProvider() === 'Baileys' ? sendViaBaileys(input) : sendViaMeta(input);
}

export async function getBaileysAccountStatus(organizationId: string) {
  const { baseUrl, token } = getBaileysConfig();
  const response = await axios.get(`${baseUrl}/v1/accounts/${encodeURIComponent(organizationId)}/status`, {
    headers: { 'x-whatsapp-service-token': token }, timeout: 10000,
  });
  return response.data?.data;
}

export async function connectBaileysAccount(organizationId: string, phoneNumber?: string) {
  const { baseUrl, token } = getBaileysConfig();
  const response = await axios.post(`${baseUrl}/v1/accounts/${encodeURIComponent(organizationId)}/connect`, phoneNumber ? { phoneNumber } : {}, {
    headers: { 'x-whatsapp-service-token': token }, timeout: 15000,
  });
  return response.data?.data;
}

export async function getBaileysQr(organizationId: string) {
  const { baseUrl, token } = getBaileysConfig();
  const response = await axios.get(`${baseUrl}/v1/accounts/${encodeURIComponent(organizationId)}/qr`, {
    headers: { 'x-whatsapp-service-token': token }, timeout: 10000,
  });
  return response.data?.data;
}

export async function disconnectBaileysAccount(organizationId: string) {
  const { baseUrl, token } = getBaileysConfig();
  const response = await axios.post(`${baseUrl}/v1/accounts/${encodeURIComponent(organizationId)}/disconnect`, {}, {
    headers: { 'x-whatsapp-service-token': token }, timeout: 15000,
  });
  return response.data?.data;
}
