import {createContext} from 'react';
// Dialog hosts share cover forms without duplicating headers or padding.
export const StockInputContext=createContext<{inDialog:boolean;setTitle:(title:string)=>void;setBusy:(busy:boolean)=>void}|null>(null);
