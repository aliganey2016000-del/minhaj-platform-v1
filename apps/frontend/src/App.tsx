/**
 * App Root Component
 *
 * Wraps the entire application with:
 * - ThemeProvider (dark/light mode)
 * - I18nProvider (multi-language via react-i18next)
 * - React Router (RouterProvider)
 */

import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './store/theme-context';
import { AuthProvider } from './store/auth-context';
import { TenantProvider } from './store/tenant-context';
import { RealtimeProvider } from './store/realtime-context';
import { router } from './routes';

// Import i18n configuration (must be before any useTranslation calls)
import './i18n';

// suganhub.com is a fully custom domain (not a *.sahaledu.com subdomain, so
// the TenantContext branding fetch doesn't cover it) — the browser tab title
// is otherwise hardcoded to "Sahal Education Platform" in index.html for
// every domain this same build serves.
if (typeof window !== 'undefined' && window.location.hostname.replace(/^www\./, '') === 'suganhub.com') {
  document.title = 'Suganhub | Where Faith, Science, and Technology Converge';
}

export function App() {
  return (
    <TenantProvider>
      <ThemeProvider>
        <AuthProvider>
          <RealtimeProvider>
            <RouterProvider router={router} />
          </RealtimeProvider>
        </AuthProvider>
      </ThemeProvider>
    </TenantProvider>
  );
}

export default App;