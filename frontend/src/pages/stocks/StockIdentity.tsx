import {Box} from '@mui/material';
import {colors} from '../../styles/tokens';
/** Shared identity line for the account stock list and master management. */
export function StockIdentity({name,symbol}:{name:string;symbol:string}){
 return <>{name}<Box component="span" sx={{ml:1,fontSize:11,fontWeight:400,color:colors.textMuted}}>{symbol}</Box></>;
}
