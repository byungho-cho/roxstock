import {createHash} from 'node:crypto';
import {Prisma,type DartFinancialFiling} from '@roxstock/shared/prisma';
import {fiscalDurationMatches,type Supplemental} from '@roxstock/shared/domain/period-valuation';
/** Sum explicit continuing/discontinued owner components only after reconciling
 * them with NCI and the stored consolidated profit in the same YTD column. */
export function reviewPublicOwnerProfit(f:DartFinancialFiling,s:Supplemental,html:string,url:string){
 let source:URL;try{source=new URL(url);}catch{return;}
 const verified=fiscalDurationMatches(f,s.fiscalDuration),end=f.periodEndDate.toISOString().slice(0,10),start=verified?s.fiscalDuration!.start:f.periodType==='ANNUAL'&&end===`${f.fiscalYear}-12-31`?`${f.fiscalYear}-01-01`:undefined;
 if(f.fsDivision!=='CFS'||!start||html.length>2_000_000||source.origin!=='https://dart.fss.or.kr'||source.pathname!=='/report/viewer.do'||source.searchParams.get('rcpNo')!==f.receiptNo)return;
 const plain=(v:string)=>v.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim(),text=plain(html);
 const bsEnd=text.indexOf('연결 포괄손익계산서'),flowEnd=text.indexOf('연결 자본변동표');if(bsEnd<0||flowEnd<=bsEnd)return;
 const balance=text.slice(0,bsEnd),income=text.slice(bsEnd,flowEnd);
 if(!balance.includes(end.replaceAll('-','.')+' 현재')||!income.includes(start.replaceAll('-','.')+' 부터 '+end.replaceAll('-','.')+' 까지')||!balance.includes('(단위 : 원)')||!income.includes('(단위 : 원)'))return;
 const n=(v:string)=>new Prisma.Decimal(v.replaceAll(',','').replace(/^\((.*)\)$/,'-$1'));
 for(const [label,amount]of [['자산총계',f.totalAssets],['부채총계',f.totalLiabilities],['자본총계',f.totalEquity]] as const){const m=new RegExp('(?:^| )'+label+' ([\\d,]+)').exec(balance);if(!m||amount==null||!n(m[1]!).eq(amount))return;}
 const number='(\\(?-?[\\d,]+\\)?)',two=new RegExp('당기순이익(?:\\(손실\\))?(?: \\(주[\\d,]+\\))? '+number+' '+number).exec(income);
 if(!two||f.netIncomeYtd==null||!n(two[f.periodType==='ANNUAL'?1:2]!).eq(f.netIncomeYtd))return;
 const directOwner=new RegExp('지배기업의 소유주에게 귀속될 계속영업손익 '+number).exec(income),directNci=new RegExp('비지배지분에 귀속될 계속영업손익 '+number).exec(income);
 if(f.periodType==='ANNUAL'&&!income.includes('중단영업')&&directOwner&&directNci){
  const owner=n(directOwner[1]!),nci=n(directNci[1]!);if(!owner.plus(nci).eq(f.netIncomeYtd))return;
  return {amount:owner.toString(),ytdAmount:owner.toString(),review:{method:'DART_PUBLIC_OWNER_COMPONENTS_RECONCILED',receiptNo:f.receiptNo,start,end,consolidatedProfit:f.netIncomeYtd.toString(),ownerProfit:owner.toString(),nonControllingProfit:nci.toString(),nonControllingDiscontinuedDerivedZero:false,sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex')}};
 }
 const ownerAt=income.indexOf('지배기업의 소유주에게 귀속되는 당기순이익(손실)'),nciAt=income.indexOf('비지배지분에 귀속되는 당기순이익(손실)'),endAt=income.indexOf('총 포괄손익의 귀속');if(ownerAt<0||nciAt<=ownerAt||endAt<=nciAt)return;
 const read=(part:string,label:string)=>{const escaped=label.replaceAll('(','\\(').replaceAll(')','\\)'),m=new RegExp(escaped+' '+number+' '+number).exec(part);return m?n(m[2]!):undefined;};
 const owned=income.slice(ownerAt,nciAt),minority=income.slice(nciAt,endAt),ownerContinuing=read(owned,'계속영업이익(손실)'),ownerDiscontinued=read(owned,'중단영업이익(손실)'),nciContinuing=read(minority,'계속영업이익(손실)');
 let nciDiscontinued=read(minority,'중단영업이익(손실)'),derivedZero=false;
 if(nciDiscontinued==null&&ownerDiscontinued?.isZero()&&read(income.slice(0,ownerAt),'중단영업이익(손실)')?.isZero()){nciDiscontinued=new Prisma.Decimal(0);derivedZero=true;}
 if(ownerContinuing==null||ownerDiscontinued==null||nciContinuing==null||nciDiscontinued==null)return;
 const owner=ownerContinuing.plus(ownerDiscontinued),nci=nciContinuing.plus(nciDiscontinued);if(!owner.plus(nci).eq(f.netIncomeYtd))return;
 return {amount:owner.toString(),ytdAmount:owner.toString(),review:{method:'DART_PUBLIC_OWNER_COMPONENTS_RECONCILED',receiptNo:f.receiptNo,start,end,consolidatedProfit:f.netIncomeYtd.toString(),ownerProfit:owner.toString(),nonControllingProfit:nci.toString(),nonControllingDiscontinuedDerivedZero:derivedZero,sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex')}};
}
