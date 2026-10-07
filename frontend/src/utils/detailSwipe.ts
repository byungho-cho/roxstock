export const detailSwipeSettings = { lockDistance: 12, distance: 44, flickDistance: 20, velocity: 0.35, axisRatio: 1.5, backEdge: 24 } as const;
/** Positive means next (left swipe); an axis locked to vertical never changes a date/stock. */
export function detailSwipeDirection(dx:number, dy:number, elapsed:number, axis:'pending'|'horizontal'|'vertical') {
  const distance=Math.abs(dx), settings=detailSwipeSettings;
  if(axis==='vertical'||distance<Math.abs(dy)*settings.axisRatio) return 0;
  if(distance<settings.distance && !(distance>=settings.flickDistance && distance/Math.max(1,elapsed)>=settings.velocity)) return 0;
  return dx<0 ? 1 : -1;
}
