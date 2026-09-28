import { useEffect, useState } from 'react';

type Metrics = {
  inner: string;
  document: string;
  visual: string;
  scale: string;
  screen: string;
  pixelRatio: string;
};

const format = (value: number) => Number(value.toFixed(2)).toString();
const dimensions = (width: number, height: number) => `${format(width)} × ${format(height)}`;

function readMetrics(): Metrics {
  const visual = window.visualViewport;
  return {
    inner: dimensions(window.innerWidth, window.innerHeight),
    document: dimensions(document.documentElement.clientWidth, document.documentElement.clientHeight),
    visual: visual ? dimensions(visual.width, visual.height) : '지원하지 않음',
    scale: visual ? format(visual.scale) : '지원하지 않음',
    screen: dimensions(window.screen.width, window.screen.height),
    pixelRatio: format(window.devicePixelRatio),
  };
}

/** Temporary, opt-in diagnostics that stay outside the page layout and scroll area. */
export function ViewportMetricsPanel() {
  const [metrics, setMetrics] = useState(readMetrics);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; setMetrics(readMetrics()); });
    };
    const visual = window.visualViewport;
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    visual?.addEventListener('resize', update, { passive: true });
    visual?.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
    };
  }, []);

  const rows = [
    ['innerWidth × innerHeight', metrics.inner],
    ['clientWidth × clientHeight', metrics.document],
    ['visualViewport width × height', metrics.visual],
    ['visualViewport scale', metrics.scale],
    ['screen width × height', metrics.screen],
    ['devicePixelRatio', metrics.pixelRatio],
  ];

  return <aside aria-label="뷰포트 측정값" style={{
    position: 'fixed', top: 'calc(env(safe-area-inset-top) + 50px)', right: 8,
    zIndex: 9999, maxWidth: 'calc(100vw - 16px)', boxSizing: 'border-box',
    padding: '8px 10px', border: '1px solid #60A5FA', borderRadius: 8,
    background: 'rgba(8, 13, 25, 0.94)', color: '#F8FAFC',
    font: '11px/1.45 monospace', fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none',
  }}>
    <strong style={{ display: 'block', marginBottom: 4 }}>Viewport 측정</strong>
    {rows.map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: '#93C5FD' }}>{label}</span><span>{value}</span>
    </div>)}
  </aside>;
}
