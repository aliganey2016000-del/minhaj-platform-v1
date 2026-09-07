import assert from 'node:assert/strict';
import { roleMiddleware } from '../middleware/role.middleware';

function runMiddleware(input: {
  role: 'admin' | 'org_admin';
  method: string;
  baseUrl: string;
  path: string;
  body: Record<string, unknown>;
}) {
  let nextCalled = false;
  let nextError: unknown;
  const req = {
    user: { role: input.role },
    method: input.method,
    baseUrl: input.baseUrl,
    path: input.path,
    body: input.body,
  } as any;

  roleMiddleware(['admin', 'org_admin'])(req, {} as any, (error?: unknown) => {
    nextCalled = true;
    nextError = error;
  });

  return { req, nextCalled, nextError };
}

// Org admins may update ordinary organization profile fields, but the
// institution classification is removed before the generic update handler.
{
  const result = runMiddleware({
    role: 'org_admin',
    method: 'PATCH',
    baseUrl: '/api/v1/schools',
    path: '/org-123',
    body: {
      name: 'Updated Institution',
      institutionType: 'university',
      organizationType: 'university',
    },
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
  assert.equal(result.req.body.name, 'Updated Institution');
  assert.equal(result.req.body.institutionType, undefined);
  assert.equal(result.req.body.organizationType, undefined);
}

// Platform admins are not stripped; their future migration workflow can use
// the institutionType field intentionally.
{
  const result = runMiddleware({
    role: 'admin',
    method: 'PATCH',
    baseUrl: '/api/v1/schools',
    path: '/org-123',
    body: { institutionType: 'university' },
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
  assert.equal(result.req.body.institutionType, 'university');
}

// The protection is scoped to organization updates; unrelated org-admin
// PATCH requests are not modified.
{
  const result = runMiddleware({
    role: 'org_admin',
    method: 'PATCH',
    baseUrl: '/api/v1/users',
    path: '/user-123',
    body: { institutionType: 'university' },
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
  assert.equal(result.req.body.institutionType, 'university');
}

console.log('institution-type-lock: all assertions passed');
