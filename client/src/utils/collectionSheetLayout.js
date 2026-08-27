export const buildAdaptiveCollectionSheetPages = ({
  entries,
  entryUnits,
  maxColumnEntries = 27,
  maxColumnUnits = 28,
}) => {
  const result = []
  const sumEntryUnits = pageEntries => pageEntries.reduce((total, entry) => total + entryUnits(entry), 0)
  let start = 0

  while (start < entries.length) {
    const remainingEntries = entries.slice(start)
    if (remainingEntries.length <= maxColumnEntries && sumEntryUnits(remainingEntries) <= maxColumnUnits) {
      result.push({ left: remainingEntries, right: [], singleColumn: true })
      break
    }

    const maxEnd = Math.min(entries.length, start + (maxColumnEntries * 2))
    let selected = null

    for (let end = maxEnd; end > start && !selected; end -= 1) {
      const pageEntries = entries.slice(start, end)
      const candidates = []

      for (let split = 1; split <= pageEntries.length; split += 1) {
        const left = pageEntries.slice(0, split)
        const right = pageEntries.slice(split)
        if (left.length > maxColumnEntries || right.length > maxColumnEntries) continue

        const leftUnits = sumEntryUnits(left)
        const rightUnits = sumEntryUnits(right)
        if (leftUnits > maxColumnUnits || rightUnits > maxColumnUnits) continue

        candidates.push({
          left,
          right,
          score: (Math.abs(left.length - right.length) * 100) + Math.abs(leftUnits - rightUnits),
        })
      }

      if (candidates.length) {
        candidates.sort((a, b) => a.score - b.score)
        selected = candidates[0]
        start = end
      }
    }

    // A single unusually tall entry must still be printable and make progress.
    if (!selected) {
      selected = { left: [entries[start]], right: [] }
      start += 1
    }

    result.push({
      left: selected.left,
      right: selected.right,
      singleColumn: selected.right.length === 0,
    })
  }

  return result
}
