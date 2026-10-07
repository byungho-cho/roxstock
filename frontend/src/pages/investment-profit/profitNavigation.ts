export const stockProfitPath = (id: string) => '/detail/investment-profit?' + new URLSearchParams({profitDetail:'stock',stock:id});
export const yearProfitPath = (year?: string) => '/detail/investment-profit?' + new URLSearchParams(year ? {tab:'year',profitDetail:'year',year} : {tab:'year'});
export const profitEntryState = {profitEntryFromStock:true};
