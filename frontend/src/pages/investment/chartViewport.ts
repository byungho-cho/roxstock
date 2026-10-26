const DAY = 86_400_000;
export type ChartViewport = { start: number; end: number };
export function clampChartViewport(start: number, span: number, bounds: ChartViewport): ChartViewport {
  const full = Math.max(0, bounds.end - bounds.start);
  const width = Math.min(full, Math.max(Math.min(DAY * 7, full), span));
  const left = Math.max(bounds.start, Math.min(bounds.end - width, start));
  return { start: left, end: left + width };
}
export function zoomChartViewport(view: ChartViewport, bounds: ChartViewport, scale: number, anchor: number, position = anchor): ChartViewport {
  const width = view.end - view.start;
  const nextWidth = Math.min(bounds.end - bounds.start, Math.max(Math.min(DAY * 7, bounds.end - bounds.start), width / Math.max(.01, scale)));
  return clampChartViewport(view.start + width * anchor - nextWidth * position, nextWidth, bounds);
}
