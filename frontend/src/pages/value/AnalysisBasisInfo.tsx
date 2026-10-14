import {Box,IconButton,Popover,Typography} from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import {useState} from 'react';
import type {ValueRow} from './valueApi';
const labels:Record<string,string>={eps:'EPS',epsYield:'EPS 수익률',netIncome:'당기순이익',issuedShares:'주식수',capital:'자본',roe:'ROE',targetPrice:'목표가',w:'W',value:'가치'};
const reasons:Record<string,string>={NOT_COLLECTED:'미수집',NOT_PROVIDED:'원천 미제공',CALCULATION_INPUT_MISSING:'계산에 필요한 동일 기준 값 부족',EPS_NON_POSITIVE:'EPS가 0 이하이므로 PER 해당 없음',BPS_NON_POSITIVE:'BPS가 0 이하이므로 PBR 해당 없음',CONSENSUS_ITEM_NOT_PROVIDED:'컨센서스 원천 미제공',EPS_MISSING:'EPS 계산 근거 부족',CURRENT_PRICE_MISSING:'가격 미수집',VALUATION_MISSING:'가치 계산 근거 부족',RIM_BASIS_UNCONFIRMED:'RIM 귀속·기간 기준 미확인',SHARES_BASIS_UNAVAILABLE:'동일 기간·종류의 검증된 주식수 없음',ESTIMATE_SOURCE_MISMATCH:'컨센서스 원천 불일치',ESTIMATE_BASIS_UNCONFIRMED:'연간 컨센서스 기준 미확인'};
export function AnalysisBasisInfo({row,testId='value-basis'}:{row:Pick<ValueRow,'name'|'symbol'> & Partial<ValueRow>;testId?:string}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 const rect=anchor?.getBoundingClientRect();
 const below=rect?window.innerHeight-rect.bottom-8:0,above=rect?rect.top-8:0;
 const placeBelow=below>=above;
 const status=row.collectionStatus??(row.collectionErrors?.length?'ERROR':Object.values(row.missingReasons??{}).some(Boolean)?'PARTIAL':'COMPLETE');
 const color=status==='ERROR'?'#F87171':status==='PARTIAL'?'#FBBF24':'#34D399';
 return <><Box component="span" data-testid="analysis-basis-year" sx={{fontSize:10,color:row.metricBasis?.year==null?'#94A3B8':row.metricBasis?.isEstimated?'#FBBF24':'#60A5FA',ml:'4px',whiteSpace:'nowrap'}}>{row.metricBasis?.year??'—'}</Box>
 <IconButton data-testid={testId} aria-label={row.name+' 자료 기준 및 출처'} aria-expanded={!!anchor} onClick={e=>{e.stopPropagation();const target=e.currentTarget;setAnchor(previous=>previous?null:target);}} onKeyDown={e=>e.stopPropagation()} sx={{p:0,width:24,height:24,color,verticalAlign:'middle'}}><InfoOutlined sx={{fontSize:15}}/></IconButton>
 <Popover open={!!anchor} anchorEl={anchor} onClose={()=>setAnchor(null)} onClick={e=>e.stopPropagation()} anchorOrigin={{vertical:placeBelow?'bottom':'top',horizontal:'left'}} transformOrigin={{vertical:placeBelow?'top':'bottom',horizontal:'left'}} marginThreshold={8} slotProps={{paper:{sx:{p:'12px',maxWidth:'min(420px,calc(100vw - 16px))',maxHeight:Math.max(48,placeBelow?below:above),overflowY:'auto',bgcolor:'#111927'}}}}><Box role="tooltip" sx={{fontSize:11,lineHeight:'18px',overflowWrap:'anywhere'}}>
  <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:1}}><Typography sx={{fontSize:13,fontWeight:600}}>{row.name} {row.symbol}</Typography><IconButton aria-label="자료 설명 닫기" onClick={()=>setAnchor(null)} sx={{p:0,fontSize:18}}>×</IconButton></Box>
  <div>{row.basisText??row.metricBasis?.label??'유효 연간 자료 미수집'}</div><div>자료 출처: {row.metricBasis?.source??'미확인'} · {row.metricBasis?.division??'연결/별도 미확인'}</div>
  <div>자본 기준: {row.capitalBasis?`${row.capitalBasis.year} · ${row.capitalBasis.source}`:'미수집'}</div>
  <div>순이익 기준: {row.netIncomeBasis?`${row.netIncomeBasis.year} · ${row.netIncomeBasis.source} · ${row.netIncomeBasis.attribution??'전체 순이익'} · 원`:'미수집'}</div>
  <div>주식수: {row.shareBasis?`${row.shareBasis.periodEndDate} · ${row.shareBasis.stockKind} · 단위 주 · 접수번호 ${row.shareBasis.receiptNo}`:'검증된 동일 공시 값 없음'}</div>
  <div>가격 기준일: {row.priceUpdatedAt??'미수집'}</div>{row.cacheGeneratedAt&&<div>캐시 생성: {row.cacheGeneratedAt}</div>}
  {(row.collectionErrors??[]).map((v,i)=><div key={'error'+i}>수집 오류: {v}</div>)}
  {Object.entries(row.missingReasons??{}).filter(([,v])=>v).map(([k,v])=><div key={k}>{labels[k]??k}: {reasons[v!]??v}</div>)}
  {Object.entries(row.sourceReasons??{}).map(([k,v])=><div key={'source'+k}>{labels[k]??k} 원천/계산 사유: {reasons[String(v)]??String(v)}</div>)}
  {[...(row.notices??[]),row.shareMissingReason,row.rimReason,row.rimShareReason].filter(Boolean).map((v,i)=><div key={'notice'+i}>{v}</div>)}
  {row.rimBasis&&<div>RIM 분모: {row.rimBasis.year} {row.rimBasis.division} · {row.rimBasis.shares??'확인 불가'}주</div>}
 </Box></Popover></>;
}
