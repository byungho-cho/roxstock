import { SnapshotChart } from '../../components/common/SnapshotChart';
import { colors } from '../../styles/tokens';
import { moneyNumber, moneyText, type InvestmentPoint } from './investmentData';
import { Box, Button, Typography } from '@mui/material';
import { useRef, useState, type TouchEvent } from 'react';
import { clampChartViewport, zoomChartViewport, type ChartViewport } from './chartViewport';

export function InvestmentChart({ points, from, to, expanded = false }: { points: InvestmentPoint[]; from: string; to: string; expanded?: boolean }) {
  return expanded ? <ZoomInvestmentChart key={`${from}:${to}`} points={points} from={from} to={to}/> : <InvestmentChartPlot points={points} from={from} to={to}/>;
}

function ZoomInvestmentChart({points,from,to}:{points:InvestmentPoint[];from:string;to:string}) {
  const bounds = {start:Date.parse(from),end:Date.parse(to)};
  const [view,setView] = useState<ChartViewport>(bounds);
  const gesture = useRef<{view:ChartViewport;distance:number;anchor:number;x:number;pinch:boolean}|null>(null);
  const pinching = useRef(false);
  const zoomed = view.start > bounds.start || view.end < bounds.end;
  const key = (value:number) => new Date(value).toISOString().slice(0,10);
  const range = {from:key(view.start),to:key(view.end)};
  const visible = points.filter(point=>point.date>=range.from&&point.date<=range.to);
  const begin = (event:TouchEvent<HTMLDivElement>) => {
    const touches=event.touches,rect=event.currentTarget.getBoundingClientRect();
    if(touches.length>=2){
      const a=touches[0]!,b=touches[1]!;
      pinching.current=true;
      gesture.current={view,distance:Math.max(1,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)),anchor:Math.max(0,Math.min(1,((a.clientX+b.clientX)/2-rect.left)/rect.width)),x:0,pinch:true};
    } else if(zoomed&&touches.length===1){
      gesture.current={view,distance:0,anchor:0,x:touches[0]!.clientX,pinch:false};
    }
  };
  const move = (event:TouchEvent<HTMLDivElement>) => {
    const active=gesture.current;if(!active)return;
    const rect=event.currentTarget.getBoundingClientRect();
    if(active.pinch&&event.touches.length>=2){
      const a=event.touches[0]!,b=event.touches[1]!;
      const position=Math.max(0,Math.min(1,((a.clientX+b.clientX)/2-rect.left)/rect.width));
      const scale=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/active.distance;
      setView(zoomChartViewport(active.view,bounds,scale,active.anchor,position));
    }else if(!active.pinch&&event.touches.length===1){
      const width=active.view.end-active.view.start;
      setView(clampChartViewport(active.view.start-(event.touches[0]!.clientX-active.x)/rect.width*width,width,bounds));
    }
  };
  const end = (event:TouchEvent<HTMLDivElement>) => {
    gesture.current=null;
    if(event.touches.length===0)pinching.current=false;
    else if(event.touches.length===1&&zoomed)begin(event);
  };
  return <Box data-testid="investment-zoom-chart" sx={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>
    <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',minHeight:26,flexShrink:0}}>
      <Typography data-testid="investment-visible-range" sx={{fontSize:10,color:colors.textMuted}}>{range.from.replaceAll('-','.')} ~ {range.to.replaceAll('-','.')}</Typography>
      <Button disabled={!zoomed} onClick={()=>{gesture.current=null;setView(bounds);}} sx={{minWidth:56,minHeight:24,p:0,fontSize:10}}>전체 보기</Button>
    </Box>
    <Box onTouchStart={begin} onTouchMove={move} onTouchEnd={end} onTouchCancel={()=>{gesture.current=null;pinching.current=false;}}
      onPointerDownCapture={event=>{if(event.pointerType==='touch'&&(zoomed||pinching.current))event.stopPropagation();}}
      onPointerMoveCapture={event=>{if(event.pointerType==='touch'&&(zoomed||pinching.current))event.stopPropagation();}}
      sx={{display:'flex',flex:1,minHeight:0,touchAction:'none','& svg':{touchAction:'none'}}}>
      <InvestmentChartPlot points={visible} from={range.from} to={range.to} expanded/>
    </Box>
  </Box>;
}

function InvestmentChartPlot({ points, from, to, expanded = false }: { points: InvestmentPoint[]; from: string; to: string; expanded?: boolean }) {
  return <SnapshotChart testId="investment-chart" ariaLabel="선택 기간 평가금액과 투자금" from={from} to={to}
    height={164} emptyFrame fill={expanded} legend={!expanded} dottedTooltipDate
    series={[{ key: 'evaluation', label: '평가금액', color: colors.marketRise, lineTestId: 'investment-evaluation-line' }, { key: 'investment', label: '투자금', color: colors.marketFall, lineTestId: 'investment-principal-line' }]}
    points={points.map(point => ({ date: point.date, values: { investment: moneyNumber(point.investment), evaluation: moneyNumber(point.evaluation) }, text: { investment: moneyText(point.investment), evaluation: moneyText(point.evaluation) } }))} />;
}
