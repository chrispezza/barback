import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import type { ComponentChildren } from 'preact';
import { isAuthenticated } from './auth';
import { Login } from './screens/Login';
import { Tonight } from './screens/Tonight';
import { Shelf } from './screens/Shelf';
import { Drinks } from './screens/Drinks';
import { DrinkDetail } from './screens/DrinkDetail';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

function Nav() {
  const { route, path } = useLocation();
  const link = (href: string, label: string) => (
    <a
      href={href}
      aria-current={path === href ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        route(href);
      }}
    >
      {label}
    </a>
  );
  return (
    <nav class="top-nav">
      {link('/tonight', 'Tonight')}
      {link('/shelf', 'Shelf')}
      {link('/drinks', 'Drinks')}
    </nav>
  );
}

function Authed({ children }: { children: ComponentChildren }) {
  const { route } = useLocation();
  if (!isAuthenticated()) {
    route('/login', true);
    return null;
  }
  return (
    <>
      <Nav />
      {children}
    </>
  );
}

function DrinkDetailRoute({ slug }: { slug?: string }) {
  return (
    <Authed>
      <DrinkDetail slug={slug ?? ''} />
    </Authed>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocationProvider>
        <Router>
          <Route path="/login" component={Login} />
          <Route path="/shelf" component={() => <Authed><Shelf /></Authed>} />
          <Route path="/drinks" component={() => <Authed><Drinks /></Authed>} />
          <Route path="/drinks/:slug" component={DrinkDetailRoute} />
          <Route default component={() => <Authed><Tonight /></Authed>} />
        </Router>
      </LocationProvider>
    </QueryClientProvider>
  );
}
