import { describe, expect, it } from 'vitest'
import { buildCollectionCards } from './CollectorPerformance'

describe('buildCollectionCards', () => {
  it('adds a recon-inclusive Reynaldo Laude Jr. card without changing the regular card', () => {
    const rows = [{
      id: 7,
      name: 'Reynaldo Laude Jr.',
      rows: [{
        date: '2026-08-24',
        dailyTarget: 1_000,
        weeklyTarget: 6_000,
        reconTarget: 250,
        withReconTarget: 1_250,
        actual: 1_125,
        rate: 112.5,
        remark: 'PASSED'
      }]
    }]

    const cards = buildCollectionCards(rows)

    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ cardKey: '7-regular', isReconVariant: false })
    expect(cards[0].rows[0]).toMatchObject({ dailyTarget: 1_000, weeklyTarget: 6_000, rate: 112.5 })
    expect(cards[1]).toMatchObject({ cardKey: '7-with-recon', displayName: 'Reynaldo Laude Jr. With Recon', isReconVariant: true })
    expect(cards[1].rows[0]).toMatchObject({ dailyTarget: 1_250, weeklyTarget: 7_500, rate: 90, remark: 'PASSED' })
  })

  it('keeps non-Laude collectors as a single regular card', () => {
    const cards = buildCollectionCards([{ id: 3, name: 'Maria Santos', rows: [] }])

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ cardKey: '3-regular', isReconVariant: false })
  })

  it('does not duplicate a different collector who happens to have the Laude surname', () => {
    const cards = buildCollectionCards([{ id: 9, name: 'Juan Laude', rows: [] }])

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ cardKey: '9-regular', displayName: 'Juan Laude', isReconVariant: false })
  })
})
