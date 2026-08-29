/**
 * App Root Component
 *
 * Wraps the entire application with theme, i18n, auth, tenant, realtime,
 * routing, and the server-authoritative student learning session tracker.
 */

import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './store/theme-context';
import { AuthProvider } from './store/auth-context';
import { TenantProvider } from './store/tenant-context';
import { RealtimeProvider } from './store/realtime-context';
import { router } from './routes';
import { LearningSessionTracker } from './features/student/components/learning-session-tracker';
import './i18n';

if (typeof window !== 'undefined' && window.location.hostname.replace(/^www\./, '') === 'suganhub.com') {
  document.title = 'Suganhub | Where Faith, Science, and Technology Converge';
}

export function App() {
  return (
    <TenantProvider>
      <ThemeProvider>
        <AuthProvider>
          <RealtimeProvider>
            <LearningSessionTracker />
            <RouterProvider router={router} />
          </RealtimeProvider>
        </AuthProvider>
      </ThemeProvider>
    </TenantProvider>
  );
}

export default App;
