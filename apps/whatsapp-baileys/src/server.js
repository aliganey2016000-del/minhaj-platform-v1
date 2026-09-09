import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 5050);
const SESSION_ROOT = process.env.WHATSAPP_BAILEYS_SESSION_DIR || '/data/sessions';
const SERVICE_TOKEN = process.env.WHATSAPP_BAILEYS_SERVICE_TOKEN?.trim();
const BACKEND_WEBHOOK_URL = process.env.WHATSAPP_BAILEYS_WEBHOOK_URL?.trim();
const BACKEND_WEBHOOK_TOKEN = process.env.WHATSAPP_BAILEYS_WEBHOOK_TOKEN?.trim();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const accounts = new Map();

function authorized(req) { if (!SERVICE_TOKEN) return process.env.NODE_ENV !== 'production'; return req.header('x-whatsapp-service-token') === SERVICE_TOKEN; }
function requireAuth(req, res, next) { if (!authorized(req)) return res.status(401).json({ success: false, message: 'Unauthorized' }); return next(); }
function safeAccountId(value) { const id = String(value || '').trim(); return /^[a-fA-F0-9-]{12,64}$/.test(id) ? id : null; }
function getState(accountId) { return accounts.get(accountId) || { socket: null, status: 'disconnected', qr: null, qrDataUrl: null, pairingCode: null, phoneNumber: null, lastError: null, reconnectTimer: null, reconnectAttempt: 0 }; }
async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function notifyBackend(payload) { if (!BACKEND_WEBHOOK_URL) return; try { const response = await fetch(BACKEND_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...(BACKEND_WEBHOOK_TOKEN ? { 'x-whatsapp-webhook-token': BACKEND_WEBHOOK_TOKEN } : {}) }, body: JSON.stringify(payload) }); if (!response.ok) logger.warn({ status: response.status }, 'WhatsApp webhook rejected'); } catch (error) { logger.warn({ err: error }, 'WhatsApp webhook delivery failed'); } }
function normalizeJid(value) { const digits = String(value || '').replace(/[^\d]/g, ''); return digits ? `${digits}@s.whatsapp.net` : ''; }

async function connectAccount(accountId, options = {}) {
  const state = getState(accountId);
  if (state.socket && state.status === 'connected') return state;
  if (state.socket && state.status === 'connecting') return state;
  await ensureDir(SESSION_ROOT);
  const authDir = path.join(SESSION_ROOT, accountId);
  await ensureDir(authDir);
  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
  state.status = 'connecting'; state.lastError = null; state.qr = null; state.qrDataUrl = null; state.pairingCode = null;
  accounts.set(accountId, state);

  const socket = makeWASocket({ auth: authState, logger, markOnlineOnConnect: false, syncFullHistory: false, browser: ['Minhaj Platform', 'Chrome', '1.0.0'], generateHighQualityLinkPreview: false });
  state.socket = socket;
  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) { state.qr = qr; try { state.qrDataUrl = await QRCode.toDataURL(qr); } catch { state.qrDataUrl = null; } state.status = 'qr_required'; }
    if (connection === 'open') { state.status = 'connected'; state.reconnectAttempt = 0; state.qr = null; state.qrDataUrl = null; state.pairingCode = null; state.phoneNumber = socket.user?.id?.split(':')[0]?.replace(/\D/g, '') || state.phoneNumber; logger.info({ accountId }, 'WhatsApp account connected'); }
    if (connection === 'close') { const code = lastDisconnect?.error?.output?.statusCode; state.socket = null; state.status = code === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected'; state.lastError = lastDisconnect?.error?.message || `connection closed (${code ?? 'unknown'})`; if (code !== DisconnectReason.loggedOut) { const delay = Math.min(30000, 1000 * (2 ** Math.min(state.reconnectAttempt, 5))); state.reconnectAttempt += 1; clearTimeout(state.reconnectTimer); state.reconnectTimer = setTimeout(() => connectAccount(accountId).catch((error) => logger.warn({ err: error, accountId }, 'WhatsApp reconnect failed')), delay); } }
    accounts.set(accountId, state);
  });
  socket.ev.on('messages.upsert', async ({ messages, type }) => { for (const message of messages) { if (!message?.message || message.key?.fromMe) continue; const jid = message.key?.remoteJid || ''; const mediaKind = message.message.imageMessage ? 'image' : message.message.videoMessage ? 'video' : message.message.documentMessage ? 'document' : message.message.audioMessage ? 'audio' : 'text'; const text = message.message.conversation || message.message.extendedTextMessage?.text || message.message.imageMessage?.caption || message.message.videoMessage?.caption || message.message.documentMessage?.caption || ''; await notifyBackend({ event: 'message.received', accountId, type, messageId: message.key?.id, from: jid, pushName: message.pushName || null, kind: mediaKind === 'text' ? 'text' : 'media', mediaType: mediaKind === 'text' ? undefined : mediaKind, text, timestamp: message.messageTimestamp ? Number(message.messageTimestamp) : Date.now(), raw: { key: message.key, message: message.message } }); } });
  socket.ev.on('messages.update', async (updates) => { for (const item of updates) { const id = item?.key?.id; if (!id || item?.update?.status == null) continue; const status = Number(item.update.status); const mapped = status >= 4 ? 'read' : status >= 3 ? 'delivered' : status === 0 ? 'failed' : 'sent'; await notifyBackend({ event: 'message.status', accountId, messageId: id, status: mapped, raw: item }); } });
  return state;
}

app.get('/health', (_req, res) => res.json({ success: true, service: 'whatsapp-baileys', accounts: accounts.size }));
app.get('/v1/accounts/:accountId/status', requireAuth, async (req, res) => { const accountId = safeAccountId(req.params.accountId); if (!accountId) return res.status(400).json({ success: false, message: 'Invalid accountId' }); const state = getState(accountId); return res.json({ success: true, data: { accountId, status: state.status, phoneNumber: state.phoneNumber, hasQr: Boolean(state.qrDataUrl), pairingCode: state.pairingCode, lastError: state.lastError } }); });
app.post('/v1/accounts/:accountId/connect', requireAuth, async (req, res) => { const accountId = safeAccountId(req.params.accountId); if (!accountId) return res.status(400).json({ success: false, message: 'Invalid accountId' }); const state = await connectAccount(accountId); if (req.body?.phoneNumber && !state.socket?.authState?.creds?.registered && state.socket?.requestPairingCode) { state.pairingCode = await state.socket.requestPairingCode(String(req.body.phoneNumber).replace(/\D/g, '')); state.status = 'pairing_required'; } return res.json({ success: true, data: { accountId, status: state.status, hasQr: Boolean(state.qrDataUrl), pairingCode: state.pairingCode } }); });
app.get('/v1/accounts/:accountId/qr', requireAuth, async (req, res) => { const accountId = safeAccountId(req.params.accountId); if (!accountId) return res.status(400).json({ success: false, message: 'Invalid accountId' }); const state = getState(accountId); return res.json({ success: true, data: { status: state.status, qrDataUrl: state.qrDataUrl, pairingCode: state.pairingCode } }); });
app.post('/v1/accounts/:accountId/send', requireAuth, async (req, res) => { const accountId = safeAccountId(req.params.accountId); if (!accountId) return res.status(400).json({ success: false, message: 'Invalid accountId' }); const to = normalizeJid(req.body?.to); const text = String(req.body?.text || '').trim(); if (!to || !text) return res.status(400).json({ success: false, message: 'to and text are required' }); const state = await connectAccount(accountId); if (state.status !== 'connected' || !state.socket) return res.status(409).json({ success: false, message: `WhatsApp account is ${state.status}` }); const sent = await state.socket.sendMessage(to, { text }); return res.status(201).json({ success: true, data: { providerMessageId: sent?.key?.id, to, status: 'sent' } }); });
app.post('/v1/accounts/:accountId/send-media', requireAuth, async (req, res) => { const accountId = safeAccountId(req.params.accountId); if (!accountId) return res.status(400).json({ success: false, message: 'Invalid accountId' }); const to = normalizeJid(req.body?.to); const mediaType = String(req.body?.mediaType || ''); const url = String(req.body?.url || ''); const caption = req.body?.caption ? String(req.body.caption) : undefined; const fileName = req.body?.fileName ? String(req.body.fileName) : undefined; if (!to || !url || !['image', 'video', 'audio', 'document'].includes(mediaType)) return res.status(400).json({ success: false, message: 'to, mediaType, and url are required' }); if (!/^https:\/\//i.test(url)) return res.status(400).json({ success: false, message: 'Media URL must use HTTPS' }); const state = await connectAccount(accountId); if (state.status !== 'connected' || !state.socket) return res.status(409).json({ success: false, message: `WhatsApp account is ${state.status}` }); const content = mediaType === 'image' ? { image: { url }, caption } : mediaType === 'video' ? { video: { url }, caption } : mediaType === 'audio' ? { audio: { url }, mimetype: 'audio/mpeg' } : { document: { url }, fileName: fileName || 'document', mimetype: 'application/octet-stream', caption }; const sent = await state.socket.sendMessage(to, content); return res.status(201).json({ success: true, data: { providerMessageId: sent?.key?.id, to, mediaType, status: 'sent' } }); });
app.post('/v1/accounts/:accountId/disconnect', requireAuth, async (req, res) => { const accountId = safeAccountId(req.params.accountId); if (!accountId) return res.status(400).json({ success: false, message: 'Invalid accountId' }); const state = getState(accountId); if (state.socket) await state.socket.logout(); clearTimeout(state.reconnectTimer); state.socket = null; state.status = 'logged_out'; state.qr = null; state.qrDataUrl = null; accounts.set(accountId, state); return res.json({ success: true, data: { accountId, status: state.status } }); });
app.listen(PORT, () => logger.info({ port: PORT, sessionRoot: SESSION_ROOT }, 'WhatsApp Baileys service listening'));
