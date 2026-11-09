// Monotonic unchanged-block anchors. Unique anchors bound the work even for
// large documents containing thousands of identical paragraphs.
export function blockMatches(before: string[], after: string[]): [number, number][] {
  const result: [number, number][] = []
  function match(a: number, endA: number, b: number, endB: number) {
    while (a < endA && b < endB && before[a] === after[b]) result.push([a++, b++])
    const tail: [number, number][] = []
    while (a < endA && b < endB && before[endA - 1] === after[endB - 1]) tail.push([--endA, --endB])
    const left = new Map<string, number>(), right = new Map<string, number>()
    for (let i = a; i < endA; i++) left.set(before[i], left.has(before[i]) ? -1 : i)
    for (let i = b; i < endB; i++) right.set(after[i], right.has(after[i]) ? -1 : i)
    const candidates: [number, number][] = []
    for (const [value, i] of left) { const j = right.get(value); if (i >= 0 && j !== undefined && j >= 0) candidates.push([i, j]) }
    const tails: number[] = [], previous: number[] = []
    candidates.forEach((pair, i) => {
      let low = 0, high = tails.length
      while (low < high) { const mid = (low + high) >>> 1; if (candidates[tails[mid]][1] < pair[1]) low = mid + 1; else high = mid }
      previous[i] = low ? tails[low - 1] : -1; tails[low] = i
    })
    const anchors: [number, number][] = []
    for (let i = tails.at(-1) ?? -1; i >= 0; i = previous[i]) anchors.push(candidates[i])
    anchors.reverse()
    if (anchors.length) {
      for (const [i, j] of anchors) { match(a, i, b, j); result.push([i, j]); a = i + 1; b = j + 1 }
      match(a, endA, b, endB)
    } else {
      // Duplicate-only regions still retain unchanged blocks without an n² table.
      const occurrences = new Map<string, number[]>()
      for (let j = b; j < endB; j++) { const list = occurrences.get(after[j]) || []; list.push(j); occurrences.set(after[j], list) }
      for (let i = a; i < endA; i++) {
        const list = occurrences.get(before[i]); if (!list) continue
        let low = 0, high = list.length
        while (low < high) { const mid = (low + high) >>> 1; if (list[mid] < b) low = mid + 1; else high = mid }
        if (low < list.length) { const j = list[low]; result.push([i, j]); b = j + 1 }
      }
    }
    result.push(...tail.reverse())
  }
  match(0, before.length, 0, after.length)
  return result
}
