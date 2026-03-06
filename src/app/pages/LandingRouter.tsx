import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { UnAuthRouteThemeManager } from '$pages/ThemeManager';
import { SSOCallback } from './auth/SSOCallback';
import { SSO_CALLBACK_PATH } from './paths';

const router = createBrowserRouter([
  {
    path: SSO_CALLBACK_PATH,
    element: (
      <>
        <UnAuthRouteThemeManager />
        <SSOCallback />
      </>
    ),
  },
  {
    path: '/lp/*',
    element: <p>Page not found</p>,
  },
]);

export function LandingRouter() {
  return <RouterProvider router={router} />;
}
