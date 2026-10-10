export const appMenuItems=[
 {label:'홈',path:'/',icon:'home'},
 {label:'종목목록',path:'/stocks',icon:'stocks'},
 {label:'매매일지',path:'/journal',icon:'journal'},
 {screen:'1300',label:'예수금',path:'/detail/cash',icon:'cash'},
 {screen:'1400',label:'자산분석',path:'/assets',icon:'assets'},
 {screen:'1500',label:'투자금',path:'/detail/investment',icon:'investment'},
 {screen:'1600',label:'투자손익',path:'/detail/investment-profit',icon:'investment-profit'},
 {label:'가치분석',path:'/detail/value',icon:'value'},
 {label:'재무제표',path:'/detail/financials',icon:'financials'},
 {label:'복리계획',path:'/detail/compound',icon:'compound'},
 {label:'모니터링',path:'/detail/collection-monitoring',icon:'monitoring'},
 {label:'설정',path:'/detail/settings',icon:'settings'},
];
export const menuIconSource=(icon:string)=>`/more-v03/${icon}.svg`;
