export const appMenuItems=[
 {label:'홈',path:'/',icon:'home'},
 {label:'대시보드',path:'/detail/assets',icon:'assets'},
 {label:'종목목록',path:'/stocks',icon:'stocks'},
 {label:'매매일지',path:'/journal',icon:'journal'},
 {screen:'1300',label:'예수금',path:'/detail/cash',icon:'cash'},
 {screen:'1400',label:'자산분석',path:'/assets',icon:'asset-analysis'},
 {screen:'1500',label:'투자금',path:'/detail/investment',icon:'investment'},
 {screen:'1600',label:'투자손익',path:'/detail/investment-profit',icon:'investment-profit'},
 {label:'가치분석',path:'/detail/value',icon:'value'},
 {screen:'3200',label:'종목소식',path:'/detail/stock-news',icon:'stock-news'},
 {label:'재무제표',path:'/detail/financials',icon:'financials'},
 {label:'복리계획',path:'/detail/compound',icon:'compound'},
 {screen:'3100',label:'투자동향',path:'/detail/investor-trends',icon:'investor-trends'},
 {label:'모니터링',path:'/detail/collection-monitoring',icon:'monitoring'},
 {label:'설정',path:'/detail/settings',icon:'settings'},
];
export const menuIconSource=(icon:string)=>icon==='stock-news'?'/stock-news/newspaper.svg':`/more-v03/${icon}.svg`;
