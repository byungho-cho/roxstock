export const notificationDestination=(kind:string)=>kind==='TARGET'?'/':kind==='NEWS'?'/detail/stock-news':null;
export const rearmAfterMs=24*60*60*1000;
export function targetTransition(previous:{matched:boolean;falseSince:Date|null;lastObservedAt:Date;lastEventAt:Date|null;generation:number}|null,matched:boolean,baseline:boolean,now:Date){
 const consecutive=previous&&now.getTime()-previous.lastObservedAt.getTime()<=5*60*1000;
 const falseSince=matched?null:previous&&!previous.matched&&consecutive?previous.falseSince??now:now;
 const fire=matched&&!baseline&&(!previous||(!previous.matched&&!!previous.falseSince&&(!previous.lastEventAt||(consecutive&&now.getTime()-previous.falseSince.getTime()>=rearmAfterMs&&now.getTime()-previous.lastEventAt.getTime()>=rearmAfterMs))));
 return {matched,falseSince,lastObservedAt:now,lastEventAt:matched&&(fire||baseline||!previous?.lastEventAt)?now:previous?.lastEventAt??null,generation:(previous?.generation??0)+(fire?1:0),fire};
}
