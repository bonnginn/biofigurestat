export type SpreadsheetControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const SCROLL_CONTAINER_SELECTOR = [
  ".adaptive-canonical-spreadsheet__table-wrap",
  ".delimited-spreadsheet__scroll",
  ".data-sheet-grid-scroll",
  ".multi-sheet-grid-scroll",
].join(", ");

/** Focus a spreadsheet control without recentering an already-visible worksheet. */
export function focusSpreadsheetControl(control: SpreadsheetControl) {
  control.focus({ preventScroll: true });
  const scrollContainer = control.closest<HTMLElement>(SCROLL_CONTAINER_SELECTOR);
  if (scrollContainer) {
    const cellRect = control.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    if (cellRect.left < containerRect.left) {
      scrollContainer.scrollLeft -= containerRect.left - cellRect.left;
    } else if (cellRect.right > containerRect.right) {
      scrollContainer.scrollLeft += cellRect.right - containerRect.right;
    }
    if (cellRect.top < containerRect.top) {
      scrollContainer.scrollTop -= containerRect.top - cellRect.top;
    } else if (cellRect.bottom > containerRect.bottom) {
      scrollContainer.scrollTop += cellRect.bottom - containerRect.bottom;
    }
  } else {
    control.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }
  if (control instanceof HTMLInputElement) control.select();
}
