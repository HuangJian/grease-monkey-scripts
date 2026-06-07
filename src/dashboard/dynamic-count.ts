export type DynamicCountOptions = {
  minItems: number
  maxItems: number
  displayRatio: number
  elbowDropRatio: number
  cutoffFloor: number
}

export function dynamicCount(scores: ReadonlyArray<number>, options: DynamicCountOptions): number {
  if (scores.length === 0) return 0
  const leader = scores[0]!
  if (!Number.isFinite(leader) || leader <= 0) {
    return options.minItems
  }

  const cutoff = Math.max(leader * options.displayRatio, options.cutoffFloor)
  let thresholdCount = 0
  for (const r of scores) {
    if (r >= cutoff) thresholdCount++
    else break
  }

  let elbowCount = scores.length
  for (let i = 1; i < scores.length; i++) {
    const prev = scores[i - 1]!
    const drop = (prev - scores[i]!) / leader
    if (drop > options.elbowDropRatio) {
      elbowCount = i
      break
    }
  }

  const count = Math.max(thresholdCount, elbowCount)
  return Math.max(options.minItems, Math.min(options.maxItems, count))
}
