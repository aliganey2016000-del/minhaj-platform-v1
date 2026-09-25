import https from 'https';

const MANAGED_RECORD_COMMENT = 'Managed by Sahal Education Platform';

export interface SchoolDomainLike {
  slug?: string;
  subdomain?: string;
  customDomain?: string;
}

export interface CloudflareZoneAccess {
  id: string;
  name: string;
  source: 'configured' | 'discovered';
}

export interface DnsProvisionItem {
  hostname: string;
  target: string;
  provisioned: boolean;
  zoneName?: string;
  zoneId?: string;
  recordId?: string;
  mode: 'cloudflare' | 'manual' | 'disabled';
  message?: string;
}

export interface SchoolDnsProvisionResult {
  configured: boolean;
  autoProvisionEnabled: boolean;
  managed: DnsProvisionItem;
  custom?: DnsProvisionItem;
}

function cleanHost(value?: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .replace(/:\d+$/, '');
}

export function baseDomain(): string {
  return cleanHost(process.env.BASE_DOMAIN || 'sahaledu.com');
}

export function managedHostnameForSchool(school: SchoolDomainLike): string {
  const label = cleanHost(school.subdomain || school.slug);
  return `${label}.${baseDomain()}`;
}

export function customHostnameForSchool(school: SchoolDomainLike): string {
  return cleanHost(school.customDomain);
}

export function cloudflareDnsConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ORIGIN_HOST);
}

export function cloudflareAutoProvisionEnabled(): boolean {
  return process.env.CLOUDFLARE_DNS_AUTO_PROVISION !== 'false';
}

export function cloudflareProxyEnabled(): boolean {
  return process.env.CLOUDFLARE_DNS_PROXIED !== 'false';
}

export function expectedTargetForSchool(school: SchoolDomainLike, kind: 'managed' | 'custom'): string {
  const managed = managedHostnameForSchool(school);
  const origin = cleanHost(process.env.CLOUDFLARE_ORIGIN_HOST);
  if (kind === 'managed') return origin || baseDomain();
  return cleanHost(process.env.CLOUDFLARE_CUSTOM_DOMAIN_TARGET) || origin || managed;
}

async function cloudflareRequest(method: string, requestPath: string, body?: unknown): Promise<any> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('Cloudflare API token is not configured.');

  const payload = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.cloudflare.com',
      port: 443,
      method,
      path: requestPath,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload.length ? { 'Content-Length': String(payload.length) } : {}),
      },
      timeout: 12000,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300 || parsed.success === false) {
            reject(new Error(parsed.errors?.[0]?.message || `Cloudflare API error ${response.statusCode || 0}`));
            return;
          }
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('timeout', () => request.destroy(new Error('Cloudflare API timed out')));
    request.on('error', reject);
    if (payload.length) request.write(payload);
    request.end();
  });
}

function candidateZoneNames(hostname: string): string[] {
  const labels = cleanHost(hostname).split('.').filter(Boolean);
  const candidates: string[] = [];
  for (let index = 0; index <= labels.length - 2; index += 1) {
    candidates.push(labels.slice(index).join('.'));
  }
  return candidates;
}

export async function findAccessibleCloudflareZone(hostname: string): Promise<CloudflareZoneAccess | null> {
  const host = cleanHost(hostname);
  if (!host || !process.env.CLOUDFLARE_API_TOKEN) return null;

  const configuredBase = baseDomain();
  const configuredZoneId = String(process.env.CLOUDFLARE_ZONE_ID || '').trim();
  if (configuredZoneId && (host === configuredBase || host.endsWith(`.${configuredBase}`))) {
    return { id: configuredZoneId, name: configuredBase, source: 'configured' };
  }

  for (const name of candidateZoneNames(host)) {
    const response = await cloudflareRequest(
      'GET',
      `/client/v4/zones?name=${encodeURIComponent(name)}&status=active&per_page=1`,
    );
    const zone = response.result?.[0];
    if (zone?.id && zone?.name) {
      return { id: zone.id, name: String(zone.name).toLowerCase(), source: 'discovered' };
    }
  }

  return null;
}

async function listExactRecords(zoneId: string, hostname: string): Promise<any[]> {
  const response = await cloudflareRequest(
    'GET',
    `/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}&per_page=100`,
  );
  return Array.isArray(response.result) ? response.result : [];
}

async function upsertCname(hostname: string, target: string): Promise<DnsProvisionItem> {
  const host = cleanHost(hostname);
  const content = cleanHost(target);
  if (!host || !content) {
    return {
      hostname: host,
      target: content,
      provisioned: false,
      mode: 'disabled',
      message: 'Cloudflare origin/target hostname is not configured.',
    };
  }
  if (host === content) {
    return {
      hostname: host,
      target: content,
      provisioned: false,
      mode: 'manual',
      message: 'DNS hostname and target cannot be the same.',
    };
  }

  const zone = await findAccessibleCloudflareZone(host);
  if (!zone) {
    return {
      hostname: host,
      target: content,
      provisioned: false,
      mode: 'manual',
      message: 'This DNS zone is not accessible with the configured Cloudflare token. Configure it at the domain provider or grant this token access to the zone.',
    };
  }

  const records = await listExactRecords(zone.id, host);
  const cname = records.find((record) => record.type === 'CNAME');
  const conflict = records.find((record) => ['A', 'AAAA'].includes(record.type));

  if (!cname && conflict) {
    return {
      hostname: host,
      target: content,
      provisioned: false,
      zoneName: zone.name,
      zoneId: zone.id,
      mode: 'manual',
      message: `A conflicting ${conflict.type} record already exists for this hostname. Remove or change it before creating the CNAME.`,
    };
  }

  const payload = {
    type: 'CNAME',
    name: host,
    content,
    ttl: 1,
    proxied: cloudflareProxyEnabled(),
    comment: MANAGED_RECORD_COMMENT,
  };

  let record: any;
  if (cname?.id) {
    const response = await cloudflareRequest(
      'PUT',
      `/client/v4/zones/${zone.id}/dns_records/${cname.id}`,
      payload,
    );
    record = response.result;
  } else {
    const response = await cloudflareRequest(
      'POST',
      `/client/v4/zones/${zone.id}/dns_records`,
      payload,
    );
    record = response.result;
  }

  return {
    hostname: host,
    target: content,
    provisioned: true,
    zoneName: zone.name,
    zoneId: zone.id,
    recordId: record?.id,
    mode: 'cloudflare',
  };
}

async function deleteManagedCname(hostname: string, expectedTarget: string, allowLegacyManagedRecord: boolean): Promise<void> {
  const host = cleanHost(hostname);
  const target = cleanHost(expectedTarget);
  if (!host || !target || !process.env.CLOUDFLARE_API_TOKEN) return;

  const zone = await findAccessibleCloudflareZone(host).catch(() => null);
  if (!zone) return;

  const records = await listExactRecords(zone.id, host).catch(() => []);
  const matches = records.filter((record) => {
    if (record.type !== 'CNAME' || cleanHost(record.content) !== target) return false;
    if (allowLegacyManagedRecord) return true;
    return String(record.comment || '').includes(MANAGED_RECORD_COMMENT);
  });

  for (const record of matches) {
    if (record.id) {
      await cloudflareRequest('DELETE', `/client/v4/zones/${zone.id}/dns_records/${record.id}`).catch(() => undefined);
    }
  }
}

export async function provisionSchoolDomains(
  school: SchoolDomainLike,
  options: { ignoreAutoProvisionSetting?: boolean } = {},
): Promise<SchoolDnsProvisionResult> {
  const configured = cloudflareDnsConfigured();
  const autoProvisionEnabled = cloudflareAutoProvisionEnabled();
  const managedHostname = managedHostnameForSchool(school);
  const managedTarget = expectedTargetForSchool(school, 'managed');

  if (!configured) {
    const disabled: DnsProvisionItem = {
      hostname: managedHostname,
      target: managedTarget,
      provisioned: false,
      mode: 'disabled',
      message: 'Cloudflare DNS credentials are not configured.',
    };
    return {
      configured,
      autoProvisionEnabled,
      managed: disabled,
      ...(customHostnameForSchool(school)
        ? {
            custom: {
              ...disabled,
              hostname: customHostnameForSchool(school),
              target: expectedTargetForSchool(school, 'custom'),
            },
          }
        : {}),
    };
  }

  if (!autoProvisionEnabled && !options.ignoreAutoProvisionSetting) {
    const disabled: DnsProvisionItem = {
      hostname: managedHostname,
      target: managedTarget,
      provisioned: false,
      mode: 'disabled',
      message: 'Automatic DNS provisioning is disabled by CLOUDFLARE_DNS_AUTO_PROVISION=false.',
    };
    return {
      configured,
      autoProvisionEnabled,
      managed: disabled,
      ...(customHostnameForSchool(school)
        ? {
            custom: {
              ...disabled,
              hostname: customHostnameForSchool(school),
              target: expectedTargetForSchool(school, 'custom'),
            },
          }
        : {}),
    };
  }

  const managed = await upsertCname(managedHostname, managedTarget);
  const customHostname = customHostnameForSchool(school);
  const custom = customHostname
    ? await upsertCname(customHostname, expectedTargetForSchool(school, 'custom'))
    : undefined;

  return { configured, autoProvisionEnabled, managed, custom };
}

export async function syncSchoolDomains(
  previous: SchoolDomainLike | null | undefined,
  current: SchoolDomainLike,
): Promise<SchoolDnsProvisionResult> {
  if (previous && cloudflareDnsConfigured() && cloudflareAutoProvisionEnabled()) {
    const oldManaged = managedHostnameForSchool(previous);
    const nextManaged = managedHostnameForSchool(current);
    if (oldManaged !== nextManaged) {
      await deleteManagedCname(oldManaged, expectedTargetForSchool(previous, 'managed'), true).catch(() => undefined);
    }

    const oldCustom = customHostnameForSchool(previous);
    const nextCustom = customHostnameForSchool(current);
    if (oldCustom && oldCustom !== nextCustom) {
      await deleteManagedCname(oldCustom, expectedTargetForSchool(previous, 'custom'), false).catch(() => undefined);
    }
  }

  return provisionSchoolDomains(current);
}
