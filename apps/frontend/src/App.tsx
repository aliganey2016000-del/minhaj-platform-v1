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
import { router } from './routes';

// Import i18n configuration (must be before any useTranslation calls)
import './i18n';

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;