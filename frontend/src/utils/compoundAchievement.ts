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
 return currentValue*10n<targetValue*9n?'below':currentValue>targetValue?'above':'near';
}
export function compoundAssetColor(current:string|null|undefined,target:string|null|undefined){
 return {below:colors.marketFall,near:colors.warning,above:colors.marketRise,unavailable:colors.textPrimary}[compoundAchievement(current,target)];
}
