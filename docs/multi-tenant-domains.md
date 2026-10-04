# Multi-tenant domains and landing pages

Every organization (`School`) gets its own public website. It is reachable at:

1. **Managed subdomain** — `<subdomain>.<BASE_DOMAIN>` (e.g. `balcad.sahaledu.com`), or
2. **Custom domain** — a domain the organization owns (e.g. `yourschool.edu`).

Host resolution is `School.findByHost()`: verified custom domain → subdomain → slug.
The root domain and `www.` are always the platform marketing site.

## Environment

| Variable | Purpose |
| --- | --- |
| `BASE_DOMAIN` | Platform root domain (backend) / `VITE_BASE_DOMAIN` (frontend build). |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ORIGIN_HOST`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_CUSTOM_DOMAIN_TARGET` | Optional DNS automation (see `.env.example`). |
| `TENANT_PROXY_SECRET` | Optional. Makes the API trust `X-Tenant-Host` only from your edge proxy. |

## Managed subdomains

Create a wildcard record `*.<BASE_DOMAIN>` pointing at the app origin (or let the
Cloudflare automation do it). The frontend nginx forwards the visitor's host to the
API in `X-Tenant-Host`.

## Custom domains

1. The org admin (Website Management → Domain) or a platform admin enters the domain.
2. **Ownership verification.** A domain set by a platform admin is verified
   immediately. A domain set by an org admin is *unverified* and does **not** serve
   the site until the admin publishes a DNS TXT record shown in the Domain tab:
   `_minhaj-verify.<domain>  TXT  minhaj-verify-<token>` and clicks **Verify ownership**
   (`POST /website-management/domain/verify`).
3. Point the domain at the platform: CNAME to the target shown in the Domain tab
   (`CLOUDFLARE_CUSTOM_DOMAIN_TARGET` / origin). The status panel warns when the
   CNAME does not match.
4. Domains that existed before verification was introduced are grandfathered
   (treated as verified).

## SSL

TLS for custom domains is terminated at the edge (Cloudflare proxy / your certificate
manager); the app does not issue certificates. The Domain tab reports the live TLS
state. For automatic certificates on arbitrary customer domains use Cloudflare for
SaaS (custom hostnames) or an ACME-capable proxy (Caddy/Traefik on-demand TLS).

## Header trust (`X-Tenant-Host`)

The edge nginx (`apps/frontend/nginx.conf`) overwrites `X-Tenant-Host`. If the API host
is directly reachable, set `TENANT_PROXY_SECRET` and have your proxy send the same value
in `X-Tenant-Proxy-Secret`; otherwise forwarded host headers are ignored and the raw
`Host` header is used.

## Landing page

Each org has a draft and a published website snapshot (Website Management). Public
endpoints return only the published snapshot. `sitemap.xml` / `robots.txt` use the
organization's canonical host (verified custom domain, else managed subdomain), never
a client-supplied header, and are cached for 5 minutes.

A few domains ship a hand-built landing page; they are registered in one place:
`apps/frontend/src/lib/site-hosts.ts` (`CUSTOM_SITE_HOSTS`).
