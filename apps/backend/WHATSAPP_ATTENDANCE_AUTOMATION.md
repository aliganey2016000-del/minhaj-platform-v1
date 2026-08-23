# WhatsApp Attendance Automation

The backend can automatically notify a student's parent when attendance is marked `absent` or `late`.

## Coolify environment variables

Set these as **runtime environment variables** on the backend service:

```text
WHATSAPP_ACCESS_TOKEN=<Meta WhatsApp Cloud API access token>
WHATSAPP_PHONE_NUMBER_ID=<Meta WhatsApp phone number ID>
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_ATTENDANCE_ALERTS_ENABLED=true
WHATSAPP_ATTENDANCE_TEMPLATE=attendance_alert
WHATSAPP_ATTENDANCE_TEMPLATE_LANGUAGE=en_US
APP_TIMEZONE=Africa/Mogadishu
```

Do not commit the access token or any other secret to Git.

## WhatsApp template

Create/approve a Meta WhatsApp template matching the configured name and language. The body must contain **six text placeholders** in this order:

1. Student name
2. Attendance status (`Absent` or `Late`)
3. Course name
4. Date
5. Start time
6. End time

The automation sends a template message because attendance alerts are business-initiated messages and should use an approved WhatsApp template when required by Meta's messaging rules.

## Behavior

- Attendance is saved first.
- WhatsApp delivery runs asynchronously after the attendance bulk write succeeds.
- A WhatsApp outage does **not** make attendance submission fail.
- Messages are stored in `WhatsAppMessage` with `queued`, `sent`, or `failed` status.
- Duplicate alerts for the same recipient, event text, template, and date are suppressed.
- Students without a linked parent or parent phone are skipped safely.
- Only `absent` and `late` trigger alerts; `present` and `excused` do not.
