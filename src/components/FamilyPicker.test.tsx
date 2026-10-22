import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/preact'
import { LocationProvider } from 'preact-iso'
import type { Tag } from '../api/types'
import { T, defaultWorld } from '../../test/fixtures/world'
import { FamilyPicker, useActiveFamily } from './FamilyPicker'

// frontend-spec §3: the client fetches GET /tags at bootstrap, selects the
// family:* tags and maps them to the segmented bar in declared display order.
// ADR-002: selecting a family issues a tag-filtered query — so a family with no
// upstream tag is not offered, and a URL that names it resolves to no family.
//
// The tags query is answered here as TanStack Query would hand it to the hook
// (status, data, isError) rather than through a stubbed fetch:
// @tanstack/react-query is externalised by Vitest, so its own `import 'react'`
// resolves to the real React and cannot render under Preact. The fetch itself
// is driven end to end in e2e/family-tags.spec.ts.

interface TagsQuery {
  status: 'pending' | 'success' | 'error'
  data: Tag[] | undefined
  isError: boolean
}

const state = vi.hoisted(() => ({
  tags: { status: 'pending', data: undefined, isError: false } as TagsQuery,
}))

vi.mock('../api/queries', () => ({
  useBarId: () => 1,
  useTags: () => state.tags,
}))

const DECLARED = ['ALL', 'SOUR', 'SPIRIT-FORWARD', 'HIGHBALL', 'TIKI', 'DESSERT']
const WITHOUT_TIKI = ['ALL', 'SOUR', 'SPIRIT-FORWARD', 'HIGHBALL', 'DESSERT']

const world = defaultWorld()
const FAMILY_TAGS = world.tags.filter((t) => t.name.startsWith('family:')).map((t) => t.name)

/** GET /tags as TagController::index answers it: the bar's tags by name, with cocktails_count. */
function tagsWithout(...names: string[]): Tag[] {
  return world.tags
    .filter((t) => !names.includes(t.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      id: t.id,
      name: t.name,
      cocktails_count: world.cocktails.filter((c) => c.tagIds?.includes(t.id)).length,
    }))
}

const loading = (): TagsQuery => ({ status: 'pending', data: undefined, isError: false })
const loaded = (data: Tag[]): TagsQuery => ({ status: 'success', data, isError: false })
const failed = (data?: Tag[]): TagsQuery => ({ status: 'error', data, isError: true })

function ActiveFamilyProbe() {
  const family = useActiveFamily()
  return <output>{family ? `${family.def.tag} ${family.tagId ?? 'untagged'}` : 'no family'}</output>
}

function mount(url: string, tags: TagsQuery) {
  state.tags = tags
  window.history.replaceState(null, '', url)
  render(
    <LocationProvider>
      <FamilyPicker />
      <ActiveFamilyProbe />
    </LocationProvider>,
  )
}

function familyBar() {
  return screen.queryByRole('group', { name: 'Drink family' })
}

function segments(): string[] {
  const bar = familyBar()
  return bar ? within(bar).getAllByRole('button').map((b) => b.textContent ?? '') : []
}

function pressed(): string | undefined {
  const bar = familyBar()
  if (!bar) return undefined
  const on = within(bar)
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-pressed') === 'true')
  return on?.textContent ?? undefined
}

function activeFamily(): string {
  return screen.getByRole('status').textContent ?? ''
}

// No Vitest globals (ADR-011), so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  state.tags = loading()
  window.history.replaceState(null, '', '/')
})

describe('the family bar in a production build', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  it('holds the declared families, in order, while GET /tags is in flight', () => {
    mount('/drinks?family=sour', loading())
    expect(segments()).toEqual(DECLARED)
    expect(pressed()).toBe('SOUR')
    expect(activeFamily()).toBe('family:sour untagged')
  })

  it('offers only the families tagged upstream once the tags answer, in declared order', () => {
    mount('/drinks', loaded(tagsWithout('family:tiki')))
    expect(segments()).toEqual(WITHOUT_TIKI)
    expect(pressed()).toBe('ALL')
  })

  it('resolves a tagged family to its upstream tag id', () => {
    mount('/drinks?family=sour', loaded(tagsWithout('family:tiki')))
    expect(activeFamily()).toBe(`family:sour ${T.sour}`)
    expect(pressed()).toBe('SOUR')
  })

  it('resolves a family with no upstream tag to no family, with All pressed', () => {
    mount('/drinks?family=tiki', loaded(tagsWithout('family:tiki')))
    expect(segments()).toEqual(WITHOUT_TIKI)
    expect(activeFamily()).toBe('no family')
    expect(pressed()).toBe('ALL')
  })

  it('draws no bar when upstream has no family tag at all', () => {
    mount('/drinks?family=sour', loaded(tagsWithout(...FAMILY_TAGS)))
    expect(familyBar()).toBeNull()
    expect(activeFamily()).toBe('no family')
  })

  it('knows of no family tag when GET /tags fails before it ever answered: no bar, no family', () => {
    mount('/tonight?family=sour', failed())
    expect(familyBar()).toBeNull()
    expect(activeFamily()).toBe('no family')
  })

  it('keeps the tags it had when a later refetch of GET /tags fails', () => {
    mount('/tonight?family=sour', failed(tagsWithout('family:tiki')))
    expect(segments()).toEqual(WITHOUT_TIKI)
    expect(activeFamily()).toBe(`family:sour ${T.sour}`)
  })
})

describe('the family bar in a dev build', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true)
  })

  it('keeps an untagged family on the bar, resolved with no tag id, so Drinks can say it is untagged', () => {
    mount('/drinks?family=tiki', loaded(tagsWithout('family:tiki')))
    expect(segments()).toEqual(DECLARED)
    expect(activeFamily()).toBe('family:tiki untagged')
    expect(pressed()).toBe('TIKI')
  })
})
