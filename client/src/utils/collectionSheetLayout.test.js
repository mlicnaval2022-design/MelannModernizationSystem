import { describe, expect, it } from 'vitest'
import { buildAdaptiveCollectionSheetPages } from './collectionSheetLayout'

const makeEntries = count => Array.from({ length: count }, (_, index) => ({ id: index + 1, units: 1 }))
const buildPages = entries => buildAdaptiveCollectionSheetPages({
  entries,
  entryUnits: entry => entry.units,
  maxColumnEntries: 27,
  maxColumnUnits: 28,
})

describe('collection sheet adaptive columns', () => {
  it('keeps a short list in one full-width column', () => {
    const pages = buildPages(makeEntries(13))

    expect(pages).toHaveLength(1)
    expect(pages[0].singleColumn).toBe(true)
    expect(pages[0].left).toHaveLength(13)
    expect(pages[0].right).toHaveLength(0)
  })

  it('balances a list across two columns only when one column cannot fit it', () => {
    const pages = buildPages(makeEntries(30))

    expect(pages).toHaveLength(1)
    expect(pages[0].singleColumn).toBe(false)
    expect(pages[0].left).toHaveLength(15)
    expect(pages[0].right).toHaveLength(15)
  })

  it('uses one column for a short final page', () => {
    const pages = buildPages(makeEntries(60))

    expect(pages).toHaveLength(2)
    expect(pages[0].singleColumn).toBe(false)
    expect(pages[1].singleColumn).toBe(true)
    expect(pages[1].left).toHaveLength(6)
  })

  it('uses two columns when row height exceeds one-column capacity', () => {
    const tallEntries = makeEntries(20).map(entry => ({ ...entry, units: 2 }))
    const pages = buildPages(tallEntries)

    expect(pages).toHaveLength(1)
    expect(pages[0].singleColumn).toBe(false)
    expect(pages[0].left).toHaveLength(10)
    expect(pages[0].right).toHaveLength(10)
  })
})
