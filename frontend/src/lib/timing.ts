/** Index of the last item whose `start` (or `t`) is <= time, or -1. */
export function indexAt<T>(items: T[], time: number, getTime: (item: T) => number): number {
  let lo = 0
  let hi = items.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (getTime(items[mid]) <= time) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
