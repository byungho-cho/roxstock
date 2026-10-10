import {colors} from '../styles/tokens';
// Compare decimal money before presentation rounding, including amounts beyond safe integers.
function decimal(value:string|null|undefined){
 if(value==null||!/^[-+]?\d+(?:\.\d+)?$/.test(value))return null;
 const [whole,fraction='']=value.replace(/^\+/,'').split('.');
 return {value:BigInt(whole+fraction),scale:10n**BigInt(fraction.length)};
}
export function compoundAchievement(current:string|null|undefined,target:string|null|undefined){
 const a=decimal(current),b=decimal(target);
 if(!a||!b||b.value<=0n)return 'unavailable';
 const currentValue=a.value*b.scale,targetValue=b.value*a.scale;
 return currentValue*10n<targetValue*9n?'below':currentValue*10n>targetValue*11n?'above':'near';
}
export function compoundTargetDifference(current:string|null|undefined,target:string|null|undefined){
 const a=decimal(current),b=decimal(target);
 if(!a||!b||b.value<=0n)return {kind:'unavailable' as const,amount:null};
 const scale=a.scale>b.scale?a.scale:b.scale;
 const difference=a.value*(scale/a.scale)-b.value*(scale/b.scale);
 const absolute=difference<0n?-difference:difference,places=scale.toString().length-1;
 const digits=absolute.toString().padStart(places+1,'0');
 const amount=places?(digits.slice(0,-places)+'.'+digits.slice(-places)).replace(/\.?0+$/,''):digits;
 return {kind:difference<0n?'shortfall' as const:difference>0n?'excess' as const:'equal' as const,amount};
}
export function compoundAssetColor(current:string|null|undefined,target:string|null|undefined){
 return {below:colors.marketFall,near:colors.warning,above:colors.marketRise,unavailable:colors.textPrimary}[compoundAchievement(current,target)];
}
