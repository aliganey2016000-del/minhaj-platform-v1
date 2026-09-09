# WhatsApp setup

Minhaj Platform now supports two WhatsApp transports:

- `baileys` — free/self-hosted WhatsApp Web transport for organization-linked devices.
- `meta` — official Meta WhatsApp Cloud API fallback.

The browser never receives provider credentials.

## Recommended: Baileys

Run `apps/whatsapp-baileys` as a separate persistent service and mount `/data/sessions` to durable storage.

Backend variables:

```env
WHATSAPP_PROVIDER=baileys
WHATSAPP_BAILEYS_SERVICE_URL=http://whatsapp-baileys:5050
WHATSAPP_BAILEYS_SERVICE_TOKEN=<long-random-service-token>
WHATSAPP_BAILEYS_WEBHOOK_TOKEN=<long-random-webhook-token>
WHATSAPP_ATTENDANCE_ALERTS_ENABLED=true
APP_TIMEZONE=Africa/Mogadishu
```

Baileys service variables:

```env
PORT=5050
WHATSAPP_BAILEYS_SESSION_DIR=/data/sessions
WHATSAPP_BAILEYS_SERVICE_TOKEN=<same-service-token>
WHATSAPP_BAILEYS_WEBHOOK_URL=http://backend:5000/api/v1/whatsapp/webhook/baileys
WHATSAPP_BAILEYS_WEBHOOK_TOKEN=<same-webhook-token>
```

After deployment, open the Admin → WhatsApp page, start the connection, and scan the QR from WhatsApp → Linked devices. The session directory must persist across restarts/deploys.

## Meta Cloud API fallback

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=<Meta permanent/system-user access token>
WHATSAPP_PHONE_NUMBER_ID=<Meta WhatsApp phone number ID>
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_ATTENDANCE_ALERTS_ENABLED=true
WHATSAPP_ATTENDANCE_TEMPLATE=attendance_alert
WHATSAPP_ATTENDANCE_TEMPLATE_LANGUAGE=en_US
APP_TIMEZONE=Africa/Mogadishu
```

Do not put secrets in Docker `ARG`, source files, or Git history.

## Attendance automation

Only `absent` and `late` attendance records generate alerts. The attendance record is saved before the notification dispatch so a WhatsApp outage cannot block attendance taking. Delivery attempts remain audited in `WhatsAppMessage`.

## Operational warning

Baileys is an unofficial WhatsApp Web client, not Meta's official API. WhatsApp Web protocol changes, linked-device limits, or account restrictions can affect it. Use it for legitimate school communication; do not use it for spam or unsolicited bulk messaging.
