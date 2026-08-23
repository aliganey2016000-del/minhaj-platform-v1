# WhatsApp Cloud API setup

Minhaj Platform uses the official Meta WhatsApp Cloud API. Credentials are runtime-only environment variables and are never exposed to the browser.

## Coolify runtime variables

```env
WHATSAPP_ACCESS_TOKEN=<Meta permanent/system-user access token>
WHATSAPP_PHONE_NUMBER_ID=<Meta WhatsApp phone number ID>
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_ATTENDANCE_ALERTS_ENABLED=true
WHATSAPP_ATTENDANCE_TEMPLATE=attendance_alert
WHATSAPP_ATTENDANCE_TEMPLATE_LANGUAGE=en_US
APP_TIMEZONE=Africa/Mogadishu
```

Do not put secrets in Docker `ARG`, source files, or Git history.

## Attendance template

Create and approve a WhatsApp template in Meta Business Manager. The attendance automation sends five body parameters in this order:

1. Student name
2. Attendance status (`Absent` or `Late`)
3. Course name (English)
4. Date
5. Session time

Only `absent` and `late` attendance records generate alerts. Present and Excused records do not send messages.

The attendance API saves the attendance record first and dispatches WhatsApp alerts asynchronously, so a WhatsApp outage cannot prevent a teacher from completing attendance. Delivery attempts are audited as `queued`, `sent`, or `failed`.

## Admin

The Admin WhatsApp page exposes connection status, attendance automation status, manual template/text sending, and the latest delivery history. Credentials remain backend-only.
