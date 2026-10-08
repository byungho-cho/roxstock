import {colors} from '../../styles/tokens';
/** Only the server's completion state controls period colors. */
export function collectionColor(state?:string) {
 switch(state){
  case 'ESTIMATE_READY':return colors.marketFall;
  case 'COMPLETE':return colors.positive;
  case 'FINANCIAL_ONLY':case 'PARTIAL_ESTIMATE':return colors.warning;
  case 'FINAL_FAILED':return colors.error;
  default:return colors.textMuted;
 }
}
