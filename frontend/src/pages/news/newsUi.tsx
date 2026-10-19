import {Box,ButtonBase,Link,Tooltip,Typography} from '@mui/material';
import {useState} from 'react';
import type {StockNews} from '../../data/stockNewsApi';
export const newsTypeNames={REPORT:'리포트',ARTICLE:'기사',DISCLOSURE:'공시'};
export const newsIcon='/stock-news/newspaper.svg';
export function newsTime(value?:string|null,dayOnly=false){
 if(!value)return '—';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '—';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return parts.month+'/'+parts.day+(dayOnly?' 시각 미상':' '+parts.hour+':'+parts.minute);
}
export function NewsIcon({size=18}:{size?:number}){return <Box component="img" src={newsIcon} alt="" sx={{width:size,height:size,flexShrink:0}}/>;}
export function ImportanceIcon({value}:{value:StockNews['importance']}){const title=value==='IMPORTANT'?'중요':'주요';return <Tooltip title={title+' · 호재·악재 또는 매수·매도 추천을 의미하지 않습니다.'} enterTouchDelay={0}><ButtonBase aria-label={title} onClick={e=>e.stopPropagation()} sx={{width:12,height:12,minWidth:12,flexShrink:0}}><img src={value==='IMPORTANT'?'/stock-news/important.svg':'/stock-news/significant.svg'} width={12} height={12} alt=""/></ButtonBase></Tooltip>;}
export function TypeChip({type}:{type:StockNews['type']}){const labels={REPORT:'리',ARTICLE:'기',DISCLOSURE:'공'},background={REPORT:'rgba(255,194,31,.55)',ARTICLE:'rgba(64,140,255,.55)',DISCLOSURE:'rgba(255,82,97,.55)'};return <Tooltip title={newsTypeNames[type]} enterTouchDelay={0}><Box component="span" aria-label={newsTypeNames[type]} tabIndex={0} onClick={e=>e.stopPropagation()} sx={{px:'4px',py:'1px',bgcolor:background[type],borderRadius:'3px',fontSize:9,lineHeight:'12px',color:'#fff',flexShrink:0}}>{labels[type]}</Box></Tooltip>;}
export function PaidIcon(){return <Tooltip title="유료 자료" enterTouchDelay={0}><Box component="span" aria-label="유료 자료" tabIndex={0} onClick={e=>e.stopPropagation()} sx={{display:'inline-flex',verticalAlign:'middle',ml:'4px',width:14,height:14}}><img src="/stock-news/paid.svg" alt="" width={14} height={14}/></Box></Tooltip>;}
export function OriginalLink({item}:{item:StockNews}){
 const [unavailable,setUnavailable]=useState(false);let url:URL|undefined;try{if(item.originalAvailable&&item.originalUrl){url=new URL(item.originalUrl);if(url.protocol!=='https:'||url.username||url.password||!['www.hankyung.com','consensus.hankyung.com','dart.fss.or.kr'].includes(url.hostname))url=undefined;}}catch{url=undefined;}
 const app=/RoxStock(?:WebOnly|App)\//.test(navigator.userAgent);
 return <Box sx={{display:'inline-flex',alignItems:'center',flexShrink:0}}><Link href={url?.href} target={app?'_self':'_blank'} rel="noopener noreferrer" aria-label="원문보기" onClick={event=>{event.stopPropagation();if(!url){event.preventDefault();setUnavailable(true);}}} sx={{cursor:'pointer',color:'#61a6ff',fontSize:'inherit',lineHeight:'inherit',textDecoration:'none',whiteSpace:'nowrap'}}>원문보기</Link>{unavailable&&<Typography role="alert" sx={{fontSize:10,color:'#FB7185',ml:'4px'}}>원문 URL 확인 필요</Typography>}</Box>;
}
