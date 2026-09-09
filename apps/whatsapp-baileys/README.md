# Minhaj WhatsApp Baileys Service

This service provides a free/self-hosted WhatsApp Web transport for Minhaj Platform using `@whiskeysockets/baileys`.

## Runtime configuration

```env
PORT=5050
WHATSAPP_BAILEYS_SESSION_DIR=/data/sessions
WHATSAPP_BAILEYS_SERVICE_TOKEN=replace-with-a-long-random-token
WHATSAPP_BAILEYS_WEBHOOK_URL=http://backend:5000/api/v1/whatsapp/webhook/baileys
WHATSAPP_BAILEYS_WEBHOOK_TOKEN=replace-with-a-second-long-random-token
```

The backend uses:

```env
WHATSAPP_PROVIDER=baileys
WHATSAPP_BAILEYS_SERVICE_URL=http://whatsapp-baileys:5050
WHATSAPP_BAILEYS_SERVICE_TOKEN=the-same-service-token
WHATSAPP_BAILEYS_WEBHOOK_TOKEN=the-same-webhook-token
```

## Account isolation

Each organization gets a separate Baileys account/session directory under `/data/sessions/<organizationId>`.
The directory must be backed by persistent storage in production; otherwise the WhatsApp link will be lost on container replacement.

## First connection

1. Start the Baileys service.
2. Open the Minhaj WhatsApp admin page.
3. Start the Baileys connection for the organization.
4. Fetch the QR and scan it from WhatsApp > Linked devices.
5. Keep `/data/sessions` on persistent storage.

Pairing-code support is available at the service layer, but QR linking is the recommended first integration path.

## Important operational note

Baileys is an unofficial WhatsApp Web client, not Meta's official Cloud API. It is free/self-hosted but can be affected by WhatsApp Web protocol changes or account restrictions. Do not use it for spam or unsolicited bulk messaging.
