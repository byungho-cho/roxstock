import {Box,type BoxProps} from '@mui/material';
import {colors} from '../../styles/tokens';
/** One search boundary includes both input and action controls. */
export function StockSearchFrame({sx,...props}:BoxProps){return <Box {...props} sx={[{flex:1,minWidth:0,height:36,boxSizing:'border-box',display:'flex',alignItems:'center',gap:1,pl:'8px',pr:'4px',bgcolor:colors.surface,border:`1px solid ${colors.border}`,borderRadius:'8px','&:focus-within':{borderColor:colors.focus},'& input':{outline:0},'& button:focus-visible':{outline:0}},...(Array.isArray(sx)?sx:[sx])]}/>;}
