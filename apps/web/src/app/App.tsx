import type { ComponentProps } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { router } from './router';

type RouterLike = ComponentProps<typeof RouterProvider>['router'];

export interface AppProps {
  /** Injectable router; defaults to the browser router. Tests pass a memory
   * router to avoid the jsdom/Node AbortSignal mismatch in createBrowserRouter. */
  routerOverride?: RouterLike;
}

export function App({ routerOverride }: AppProps) {
  return (
    <Providers>
      <RouterProvider router={routerOverride ?? router} />
    </Providers>
  );
}
