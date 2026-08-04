import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { isAuthenticated } from './auth';
import { useBarId, useCocktails, useShelf } from './api/queries';
import { ToastHost } from './components/toasts';
import { Login } from './screens/Login';
import { FirstPours } from './screens/FirstPours';
import { Tonight } from './screens/Tonight';
import { Shelf } from './screens/Shelf';
import { Drinks } from './screens/Drinks';
import { DrinkDetail } from './screens/DrinkDetail';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

const NAV = [
  { href: '/tonight', label: 'Tonight', hint: 'pour now' },
  { href: '/shelf', label: 'Shelf', hint: 'what you have' },
  { href: '/drinks', label: 'Drinks', hint: 'the full index' },
];

function NavLink({
  href,
  label,
  hint,
  className,
}: {
  href: string;
  label: string;
  /** Role hint under the label — rail only; the tab bar stays bare. */
  hint?: string;
  className: string;
}) {
  const { route, path } = useLocation();
  return (
    <a
      href={href}
      class={className}
      aria-current={path === href ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        route(href);
      }}
    >
      {label}
      {hint && <span class="rail-hint">{hint}</span>}
    </a>
  );
}

/** Desktop 212px rail: brand, fleuron, nav, shelf standing in the footer. */
function RailNav() {
  const barId = useBarId();
  const shelf = useShelf(barId);
  const canMake = useCocktails(barId, { on_shelf: true }, 1);
  const bottles = shelf.data?.meta?.total ?? shelf.data?.data.length;
  const pourable = canMake.data?.meta?.total;
  return (
    <nav class="nav-rail" aria-label="Main">
      <div class="rail-brand">Barback</div>
      <div class="rail-fleuron" aria-hidden="true">
        <span />◆<span />
      </div>
      <div class="rail-items">
        {NAV.map((n) => (
          <NavLink key={n.href} href={n.href} label={n.label} hint={n.hint} className="rail-item" />
        ))}
      </div>
      {bottles !== undefined && pourable !== undefined && (
        <div class="rail-foot">
          {bottles} bottles · {pourable} pourable
        </div>
      )}
    </nav>
  );
}

/** Mobile bottom tab bar (56px targets, brass top border marks the active tab). */
function TabBar() {
  return (
    <nav class="tab-bar" aria-label="Main">
      {NAV.map((n) => (
        <NavLink key={n.href} href={n.href} label={n.label} className="tab-item" />
      ))}
    </nav>
  );
}

/** ADR-002 validation (frontend-spec §3): dev-only, tree-shaken from prod. */
function DevReports() {
  const barId = useBarId();
  useEffect(() => {
    if (barId !== undefined) {
      void import('./dev/reports').then((m) => m.runDevReports(barId));
    }
  }, [barId]);
  return null;
}

function Authed({ children }: { children: ComponentChildren }) {
  const { route } = useLocation();
  if (!isAuthenticated()) {
    route('/login', true);
    return null;
  }
  return (
    <div class="app-shell">
      <RailNav />
      <div class="app-main">{children}</div>
      <TabBar />
      {import.meta.env.DEV && <DevReports />}
    </div>
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
          <Route path="/first-pours" component={() => <Authed><FirstPours /></Authed>} />
          <Route path="/drinks/:slug" component={DrinkDetailRoute} />
          <Route default component={() => <Authed><Tonight /></Authed>} />
        </Router>
        <ToastHost />
      </LocationProvider>
    </QueryClientProvider>
  );
}
