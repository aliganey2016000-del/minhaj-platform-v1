/**
 * Lightweight User-Agent parser — best-effort device/browser/OS
 * classification for activity logs. Not a full UA database (no external
 * dependency); covers the common cases well enough for an admin-facing
 * "device/browser/OS" column, not for anything security-sensitive.
 */

export interface ParsedUserAgent {
  device: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string | undefined): ParsedUserAgent {
  const s = ua || '';

  let device: ParsedUserAgent['device'] = 'desktop';
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(s)) device = 'tablet';
  else if (/Mobi|iPhone|Android/i.test(s)) device = 'mobile';

  let browser = 'Unknown';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/CriOS\//i.test(s)) browser = 'Chrome (iOS)';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = 'Safari';

  let os = 'Unknown';
  if (/Windows NT/i.test(s)) os = 'Windows';
  else if (/Mac OS X/i.test(s) && !/iPhone|iPad/i.test(s)) os = 'macOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(s)) os = 'iOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  return { device, browser, os };
}
