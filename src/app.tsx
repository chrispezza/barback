import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { LocationProvider, Router, Route, useLocation } from 'preact-iso';
import type { ComponentChildren, ComponentType } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Button } from '@ds/core/Button';
import { clearToken, isAuthenticated } from './auth';
import { queryDefaults } from './api/client';
import { useBarId, useCocktails, useShelf } from './api/queries';
import { unlessFailed } from './api/unlocks';
import { useActiveFamily } from './components/FamilyPicker';
import { ToastHost } from './components/toasts';
import { Login } from './screens/Login';
import { FirstPours } from './screens/FirstPours';
import { Tonight } from './screens/Tonight';
import { Shelf } from './screens/Shelf';
import { Drinks } from './screens/Drinks';
import { DrinkDetail } from './screens/DrinkDetail';

// One retry for a read, and every call goes out however the device looks
// (src/api/client.ts queryDefaults; ADR-007).
const queryClient = new QueryClient({ defaultOptions: queryDefaults });

const NAV = [
  { href: '/tonight', label: 'Tonight', hint: 'pour now' },
  { href: '/shelf', label: 'Shelf', hint: 'what you have' },
  { href: '/first-pours', label: 'Classics', hint: 'drinks to aim for' },
  { href: '/drinks', label: 'Drinks', hint: 'the full index' },
];

/** Static screen titles; the recipe screen sets its own (src/screens/DrinkDetail.tsx). */
const TITLES: Record<string, string> = {
  '/tonight': 'Tonight',
  '/shelf': 'Shelf',
  '/first-pours': 'The classics',
  '/drinks': 'Drinks',
  '/login': 'Log in',
};

export function setScreenTitle(title: string): void {
  document.title = `${title} · Barback`;
}

/** Where RouteEffects marks, in each history entry, whether one of the app's own entries is behind it. */
const APP_BEHIND = 'barback.appBehind';

function readAppBehind(state: unknown): boolean | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const mark: unknown = (state as Record<string, unknown>)[APP_BEHIND];
  return typeof mark === 'boolean' ? mark : undefined;
}

/**
 * Whether the history entry behind this one is one of the app's own, so a
 * step back stays in the app. history.length cannot say: it counts the whole
 * tab, so a recipe opened into a tab that has been somewhere first has a
 * length over one and nothing of the app's behind it. Read by the recipe's
 * Back (src/screens/DrinkDetail.tsx; frontend-spec §9).
 */
export function appScreenBehind(): boolean {
  return readAppBehind(window.history.state) === true;
}

/**
 * Mark the entry on screen, once, with whether one of the app's own entries is
 * behind it. The mark lives on the entry, so it holds through the browser's
 * Back and Forward and through a reload. The first entry this document shows
 * was opened from outside (a launch, a shared link, an address typed into a
 * tab that has been somewhere first): nothing of the app's is known to be
 * behind it. Every later one was reached from inside the app, by a link, a
 * button or the door, on top of the entry it was reached from. The app's
 * replace navigations (Landing, the door's redirect) run in the commit that
 * reached the entry they replace, before it is marked, so what they leave is
 * marked as that entry would have been.
 */
function markEntry(reachedInApp: boolean): void {
  if (readAppBehind(window.history.state) !== undefined) return;
  window.history.replaceState({ [APP_BEHIND]: reachedInApp }, '');
}

/** What the reader does that ends a wait for the heading: they have moved on. */
const READER_MOVES = ['focusin', 'keydown', 'pointerdown'] as const;

/**
 * Move focus to the screen's heading once it renders. A screen still reading
 * what it names (a recipe the client has not read) has no heading at the route
 * change, and the control that was tapped went with the screen it was on, so
 * focus has fallen to <body> until the heading arrives. The wait is for this
 * route change alone: it ends when the heading takes focus, at the next route
 * change, or as soon as the reader moves focus, presses a key or touches the
 * page, so a heading that renders later never takes focus from where the
 * reader put it. Armed as the route change commits, so even a move made
 * before the next frame counts. Returns what ends the wait.
 */
function focusHeadingOnArrival(): () => void {
  let waiting = true;
  const observer = new MutationObserver(() => land());
  function stop() {
    waiting = false;
    observer.disconnect();
    for (const type of READER_MOVES) document.removeEventListener(type, stop, true);
  }
  function land() {
    const heading = waiting ? document.querySelector<HTMLElement>('main h1') : null;
    if (!heading) return;
    stop();
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  for (const type of READER_MOVES) document.addEventListener(type, stop, true);
  observer.observe(document.body, { childList: true, subtree: true });
  // A screen that names itself at once has its heading already; look once the
  // render that changed the route has finished committing.
  queueMicrotask(land);
  return stop;
}

/**
 * After a client-side navigation the browser announces nothing and focus stays
 * on whatever was tapped. Name the screen in the tab/history and move focus to
 * its heading, once it renders, so assistive tech reads where it landed (ADR-003
 * Consequences). Skips the initial load. Every entry shown, a screen or not,
 * is marked with whether the app is behind it (markEntry).
 */
function RouteEffects() {
  const { path, url } = useLocation();
  const previous = useRef<string | null>(null);
  const opened = useRef(false);
  useLayoutEffect(() => {
    markEntry(opened.current);
    opened.current = true;
  }, [url]);
  useLayoutEffect(() => {
    // A path no screen answers is left at once (Landing). It shows nothing to
    // name or to focus, and it is not where the reader was: landing on Tonight
    // from it is still the page load, or still the route change that reached it.
    if (!isScreen(path)) return;
    const isChange = previous.current !== null && previous.current !== path;
    previous.current = path;
    const title = TITLES[path];
    if (title) setScreenTitle(title);
    if (!isChange) return;
    return focusHeadingOnArrival();
  }, [path]);
  return null;
}

/** The screens a family lens spans (frontend-spec §6: Tonight ↔ Index). */
const FAMILY_SCREENS = new Set(['/tonight', '/drinks']);

/**
 * Where a nav link goes from here. Tonight and Drinks carry the current
 * `?family=` so "a sour tonight" survives the hop (frontend-spec §6); every
 * other screen, and every other parameter (Drinks paging, favorites), stays
 * behind. A value that names no family the bar offers — none at all, or one
 * with no upstream tag — is not carried.
 */
function useNavHref(href: string): string {
  const family = useActiveFamily();
  if (!family || !FAMILY_SCREENS.has(href)) return href;
  return `${href}?family=${encodeURIComponent(family.def.tag.replace('family:', ''))}`;
}

/**
 * A main-nav link is a plain link, with no click handler of its own:
 * LocationProvider routes every same-origin link click itself, pushing one
 * history entry, and leaves a modified click (new tab, new window) to the
 * browser. A handler here that also called route() pushed a second entry for
 * the same tap, so Back, in the browser or the installed app, had to be
 * pressed twice (ADR-003 Consequences, ADR-007), and it kept Ctrl/Cmd-click
 * from opening a new tab. The rail's brand mark follows the same rule.
 */
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
  const { path } = useLocation();
  const to = useNavHref(href);
  return (
    <a href={to} class={className} aria-current={path === href ? 'page' : undefined}>
      {label}
      {hint && <span class="rail-hint">{hint}</span>}
    </a>
  );
}

/** Log out: drop the token and the cached bar, return to the door. */
export function useLogout(): () => void {
  const { route } = useLocation();
  const client = useQueryClient();
  return () => {
    clearToken();
    client.clear();
    route('/login');
  };
}

/** Desktop 212px rail: brand, fleuron, nav, shelf standing in the footer. */
function RailNav() {
  const barId = useBarId();
  const shelf = useShelf(barId);
  const canMake = useCocktails(barId, { on_shelf: true }, 1);
  const home = useNavHref('/tonight');
  const logout = useLogout();
  // Neither count from a read whose refetch failed: it keeps its last answer
  // beside the error, and the line would state that stock beside the screen's
  // error line (ADR-007 Consequences, "No stock answer is ever served stale";
  // chrispezza/barback#103). The footer holds Log out alone then, as it does
  // before both reads first answer.
  const shelfRead = unlessFailed(shelf);
  const bottles = shelfRead?.meta?.total ?? shelfRead?.data.length;
  const pourable = unlessFailed(canMake)?.meta?.total;
  return (
    <nav class="nav-rail" aria-label="Main">
      {/* A plain link, routed once by LocationProvider (see NavLink). */}
      <a href={home} class="rail-brand">
        Barback
      </a>
      <div class="rail-fleuron" aria-hidden="true">
        <span />◆<span />
      </div>
      <div class="rail-items">
        {NAV.map((n) => (
          <NavLink key={n.href} href={n.href} label={n.label} hint={n.hint} className="rail-item" />
        ))}
      </div>
      <div class="rail-foot">
        {bottles !== undefined && pourable !== undefined && (
          <p class="rail-standing">
            {bottles} bottle{bottles === 1 ? '' : 's'} · {pourable} pourable
          </p>
        )}
        <Button variant="ghost" size="sm" onClick={logout}>
          Log out
        </Button>
      </div>
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
  const { route, url } = useLocation();
  if (!isAuthenticated()) {
    route(`/login?next=${encodeURIComponent(url)}`, true);
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

/** A screen behind the door: the shell around it once signed in. */
function behindDoor(Screen: ComponentType): ComponentType {
  return () => (
    <Authed>
      <Screen />
    </Authed>
  );
}

/**
 * The route table (frontend-spec §1): each screen by the path it answers. No
 * other path is a screen, "/" included (Landing).
 */
const SCREENS: readonly { path: string; component: ComponentType<{ slug?: string }> }[] = [
  { path: '/login', component: Login },
  { path: '/tonight', component: behindDoor(Tonight) },
  { path: '/shelf', component: behindDoor(Shelf) },
  { path: '/drinks', component: behindDoor(Drinks) },
  { path: '/first-pours', component: behindDoor(FirstPours) },
  { path: '/drinks/:slug', component: DrinkDetailRoute },
];

/**
 * Whether a screen answers this path. preact-iso keeps its matcher internal,
 * so this reads the patterns in SCREENS as the Router reads them: segment by
 * segment, a `:name` segment taking any one segment, nothing left over.
 */
export function isScreen(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  return SCREENS.some((screen) => {
    const pattern = screen.path.split('/').filter(Boolean);
    return (
      pattern.length === segments.length &&
      pattern.every((part, i) => part.startsWith(':') || part === segments[i])
    );
  });
}

/** Where the app opens, and where a path no screen answers goes. */
const HOME = '/tonight';

/**
 * "/", the installed app's start_url (public/manifest.webmanifest; ADR-007),
 * and any path no screen answers land on Tonight's own route, so the nav marks
 * Tonight as the current tab and the tab names it (ADR-003 Consequences;
 * frontend-spec §7). Rendering Tonight in place left it with neither. A
 * replace navigation: the address the app opened at leaves no history entry
 * for Back to spend. The query comes along, so "/?family=sour" is still a
 * sour Tonight.
 */
function Landing() {
  const { url, route } = useLocation();
  useLayoutEffect(() => {
    const query = url.indexOf('?');
    route(query === -1 ? HOME : `${HOME}${url.slice(query)}`, true);
  }, [url, route]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocationProvider>
        <Router>
          {SCREENS.map((screen) => (
            <Route key={screen.path} path={screen.path} component={screen.component} />
          ))}
          <Route default component={Landing} />
        </Router>
        <RouteEffects />
        <ToastHost />
      </LocationProvider>
    </QueryClientProvider>
  );
}
