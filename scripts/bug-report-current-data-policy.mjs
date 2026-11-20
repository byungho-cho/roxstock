export function decideReportEvent(e,r,x,{Decimal,valueCompletion}){
 const ms=v=>v?new Date(v).getTime():0,valid=v=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v),out=(resolution,proof)=>({resolution,proof});
 if(r.feature==='realtime-prices'&&r.code==='PRICE_REALTIME_PUBLISH_FAILED'&&e.securityId==null&&!e.symbol&&x.realtime&&ms(x.realtime.lastSsePublishedAt)>ms(e.observedAt)&&x.realtime.publishFailureCount===0&&!x.realtime.lastPublishError)return out('REALTIME_PUBLISH_RECOVERED',{lastSsePublishedAt:x.realtime.lastSsePublishedAt,publishedCount:x.realtime.publishedCount});
 if(r.feature==='kis-fundamentals'&&r.code==='COLLECTION_FAILED'&&e.securityId==null&&!e.symbol&&x.wholeOperation?.jobType==='kis-fundamentals'&&x.wholeOperation.successCount>0&&x.wholeOperation.failureCount===0&&ms(x.wholeOperation.finishedAt)>ms(e.observedAt))return out('KIS_JOB_EXECUTION_RECOVERED',{runId:String(x.wholeOperation.id),finishedAt:x.wholeOperation.finishedAt});
 const s=x.security,p=x.valuation,t=x.task,f=x.filing;
 if(!s)return null;
 if(e.securityId!=null&&String(e.securityId)!==String(s.id)||e.symbol&&e.symbol!==s.symbol||s.codeRevision>0&&!e.symbol)return null;
 const financial=r.feature==='dart-financial-statements';
 const warningLike=/^(PERIOD_|DART_REVIEW_|DART_SOURCE_REVIEW$|SOURCE_REVIEW_REQUIRED$|HISTORICAL_CORE_ACCOUNTS_INCOMPLETE$|KIS_PRICE_NO_DATA$|HISTORICAL_PRICE_COMMUNICATION$)/.test(r.code);
 if(financial&&warningLike&&(s.collectionExcluded||['ETF','ETN','REIT'].includes(s.securityType)||s.excludedFeatures?.includes?.('dart-financial-statements')||s.excludedFeatures?.includes?.('valuation')))return out('EXISTING_COLLECTION_POLICY_EXCLUDED',{securityId:String(s.id),symbol:s.symbol});
 if(financial&&warningLike&&t?.status==='EXCLUDED')return out('EXISTING_PERIOD_POLICY_EXCLUDED',{taskId:String(t.id),status:t.status,errorCode:t.errorCode});
 if(financial&&warningLike&&t?.status==='NOT_DUE')return out('PERIOD_NOT_DUE_CURRENT_POLICY',{taskId:String(t.id),status:t.status});
 if(financial&&warningLike&&t?.status==='NOT_APPLICABLE'&&['SECURITY_TYPE_NOT_APPLICABLE','SECURITY_INACTIVE','PRE_LISTING_POLICY_EXCLUDED','USER_COLLECTION_EXCLUDED','USER_PERIOD_COLLECTION_EXCLUDED'].includes(t.errorCode))return out('EXISTING_PERIOD_NOT_APPLICABLE',{taskId:String(t.id),errorCode:t.errorCode});
 const samePeriod=p&&e.fiscalYear===p.fiscalYear&&e.periodType===p.periodType&&(!p.collectionSymbol||p.collectionSymbol===s.symbol)&&ms(p.updatedAt)>=ms(e.observedAt);
 const missingMetricCause=/^PERIOD_(EPS|BPS|ROE|PER|PBR)_MISSING$/.test(r.code)||['PERIOD_PRICE_BASIS_UNCONFIRMED','KIS_PRICE_NO_DATA','HISTORICAL_PRICE_COMMUNICATION','KRX_ROLLOUT_NOT_VALIDATED','PERIOD_PRICE_BEFORE_LISTING'].includes(r.code);
 if(financial&&missingMetricCause&&samePeriod&&e.metric&&['eps','bps','roe','per','pbr'].includes(e.metric)){
  const v=p.values?.[e.metric],ev=p.provenance?.perMetric?.[e.metric]??p.provenance;
  if(valid(v)&&(!['per','pbr'].includes(e.metric)||new Decimal(v).gt(0))){
   const resolution=ev?.source==='USER_CURRENT_SHARES_REFERENCE'?'USER_CURRENT_SHARES_REFERENCE_ACCEPTED':ev?.referenceOnly||ev?.bpsReferenceOnly?'ACCEPTED_REFERENCE_METRIC_PRESENT':'STORED_METRIC_PRESENT';
   return out(resolution,{securityId:String(s.id),year:p.fiscalYear,period:p.periodType,metric:e.metric,value:v,source:ev?.source??null,updatedAt:p.updatedAt});
  }
  const currency=/^[A-Z]{3}$/.test(p.provenance?.currency??'')?p.provenance.currency:/^[A-Z]{3}$/.test(f?.currency??'')?f.currency:'KRW',na=valueCompletion(p.values??{},currency).notApplicable?.[e.metric];
  if(na)return out('METRIC_NORMAL_NOT_APPLICABLE',{metric:e.metric,reason:na,updatedAt:p.updatedAt});
  if(['per','pbr'].includes(e.metric)&&x.preListing)return out('PRICE_PERIOD_PRE_LISTING',{metric:e.metric,updatedAt:p.updatedAt});
 }
 if(financial&&!e.metric&&!['DART_REVIEW_FISCAL_DURATION_UNVERIFIED','PERIOD_PRICE_BASIS_UNCONFIRMED'].includes(r.code)&&t?.status==='SUCCESS'&&f&&!f.isWithdrawn&&f.securityId===s.id&&f.fiscalYear===e.fiscalYear&&f.periodType===e.periodType&&(!f.collectionSymbol||f.collectionSymbol===s.symbol)&&t.selectedReceiptNo===f.receiptNo&&ms(f.collectedAt)>ms(e.observedAt)&&ms(t.processedAt)>ms(e.observedAt)&&f.relationship==='EXACT'&&f.selectedReceiptNo===f.receiptNo&&f.returnedReceiptNo===f.receiptNo&&f.proofDivision===f.fsDivision&&Number(f.taskFiscalYear)===e.fiscalYear&&f.reportPeriod===new Date(f.periodEndDate).toISOString().slice(0,7)&&/^[A-Z]{3}$/.test(f.currency??'')&&['revenueYtd','operatingProfitYtd','netIncomeYtd','totalAssets','totalLiabilities','totalEquity'].every(k=>f[k]!=null)&&new Decimal(f.totalAssets).minus(f.totalLiabilities).minus(f.totalEquity).abs().lte(1))return out('EXACT_CORE_SOURCE_VERIFIED',{filingId:String(f.id),receiptNo:f.receiptNo,currency:f.currency,collectedAt:f.collectedAt,taskId:String(t.id),processedAt:t.processedAt});
 if(r.feature==='kis-fundamentals'&&r.code==='KIS_FUNDAMENTAL_NO_DATA'&&x.snapshot?.collectionSymbol===s.symbol&&ms(x.snapshot.collectedAt)>ms(e.observedAt)&&['eps','bps','per','pbr','listedShares'].some(k=>x.snapshot[k]!=null))return out('KIS_CURRENT_DATA_RECOVERED',{snapshotId:String(x.snapshot.id),collectedAt:x.snapshot.collectedAt});
 if(r.feature==='market-prices'&&x.operation?.jobType==='market-prices'&&ms(x.operation.finishedAt)>ms(e.observedAt))return out('TARGET_PRICE_OPERATION_RECOVERED',{runId:String(x.operation.runId),itemId:String(x.operation.id),finishedAt:x.operation.finishedAt});
 if(r.feature==='realtime-prices'&&r.code==='PRICE_REALTIME_SOURCE_FAILED'&&x.operation?.jobType==='realtime-selected-prices'&&ms(x.operation.finishedAt)>ms(e.observedAt))return out('REALTIME_TARGET_SOURCE_RECOVERED',{runId:String(x.operation.runId),itemId:String(x.operation.id),finishedAt:x.operation.finishedAt});
 return null;
}
