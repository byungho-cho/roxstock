import {selectNews,type NewsCandidate} from '@roxstock/shared/news/policy';
/** Only eligible, new Naver articles count toward this execution's five-item capacity. */
export function naverArticlesSufficient(candidates:NewsCandidate[],existing:Set<string>,now:Date){
 return selectNews(candidates.filter(c=>c.provider==='NAVER_NEWS'&&c.materialType==='ARTICLE'&&c.priority>=2&&c.publishedAt<=now&&c.publishedAt.getTime()+72*3600000>=now.getTime()),existing).length>=5;
}
