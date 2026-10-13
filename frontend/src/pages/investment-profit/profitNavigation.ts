export const stockProfitPath = (id: string) => '/detail/investment-profit?' + new URLSearchParams({profitDetail:'stock',stock:id});
export const yearProfitPath = (year?: string,securityId?:string) => '/detail/investment-profit?' + new URLSearchParams({... (year ? {tab:'year',profitDetail:'year',year} : {tab:'year'}),...(securityId?{securityId}:{})});
export const profitEntryState = {profitEntryFromStock:true};
