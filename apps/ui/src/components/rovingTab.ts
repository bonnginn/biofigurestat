/** Return the next index for a horizontal ARIA tablist, or null for an unrelated key. */
export function nextRovingTabIndex(key: string, currentIndex: number, itemCount: number) {
  if (itemCount <= 0) return null;
  if (key === "ArrowRight") return (currentIndex + 1) % itemCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + itemCount) % itemCount;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return null;
}
