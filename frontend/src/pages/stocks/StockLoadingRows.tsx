import {Box} from '@mui/material';

/** Initial data waits show no cards or table rows; only the existing controls remain. */
export function StockLoadingRows(){return <Box data-testid="stock-list-pending" aria-label="종목 목록 조회 중" aria-busy sx={{minHeight:0}}/>;}
