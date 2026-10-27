import type {FastifyInstance} from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {authContext,type AuthIdentity} from './context.js';
import {cookies,cookieNames,sessionIdentity} from './service.js';
import {tokenHash} from './crypto.js';
const publicPaths=new Set(['/api/version','/api/auth/login','/api/auth/register','/api/auth/verify','/api/auth/resend','/api/auth/forgot','/api/auth/reset','/api/auth/link-status']);
const limitedPaths=new Set(['/api/auth/me','/api/auth/change-password','/api/auth/logout','/api/auth/refresh']);
export function installAuth(app:FastifyInstance){
  app.decorateRequest('auth',null);
  app.addHook('onRequest',async(request,reply)=>{
    const path=request.url.split('?')[0]!;
    if(!path.startsWith('/api/'))return; // Internal endpoints retain their separate collector credentials.
    reply.header('Cache-Control','private, no-store').header('Referrer-Policy','no-referrer');
    if(!['GET','HEAD','OPTIONS'].includes(request.method)){
      const allowed=process.env.AUTH_PUBLIC_ORIGIN??'http://127.0.0.1:3000';
      if(request.headers.origin!==allowed)throw new ApiError(403,'ORIGIN_FORBIDDEN','허용되지 않은 요청입니다.');
      if(!String(request.headers['content-type']??'').startsWith('application/json'))throw new ApiError(415,'JSON_REQUIRED','JSON 요청만 허용합니다.');
    }
    if(publicPaths.has(path))return;
    const identity=await sessionIdentity(request);
    if(!identity)throw new ApiError(401,'LOGIN_REQUIRED','로그인이 필요합니다.');
    request.auth=identity;
    // A stale tab must never apply its pending writes to a newly signed-in account.
    // This is only a consistency check; identity always comes from the DB session.
    const expected=request.headers['x-auth-user'];
    if(expected!==undefined&&expected!==String(identity.userId))throw new ApiError(409,'IDENTITY_CHANGED','계정이 변경되었습니다. 화면을 다시 열어 주세요.');
    if(identity.mustChangePassword&&!limitedPaths.has(path))throw new ApiError(403,'PASSWORD_CHANGE_REQUIRED','비밀번호를 먼저 변경해 주세요.');
    if(!['GET','HEAD','OPTIONS'].includes(request.method)){
      const token=cookies(request)[cookieNames.csrf],header=request.headers['x-csrf-token'];
      const session=await prisma.authSession.findUnique({where:{id:identity.sessionId},select:{csrfHash:true}});
      if(!token||token!==header||tokenHash(token)!==session?.csrfHash)throw new ApiError(403,'CSRF_FORBIDDEN','요청을 다시 시도해 주세요.');
    }
    const admin=/^\/api\/(admin(?:\/|$)|collection(?:\/|$)|backups?(?:\/|$)|security-management(?:\/|$)|security-data(?:\/|$)|stock-news\/settings|prices\/.+refresh)/.test(path)||/financial-refresh|annual-estimates\/refresh/.test(path)||(!['GET','HEAD','OPTIONS'].includes(request.method)&&/^\/api\/securities\/\d+\/(analysis|price)$/.test(path));
    if(admin&&identity.role!=='ADMIN')throw new ApiError(403,'ADMIN_REQUIRED','관리자만 사용할 수 있습니다.');
  });
  app.addHook('preHandler',async request=>{
    if(!request.auth||request.url.startsWith('/api/auth/'))return;
    const uid=request.auth.userId,notFound=()=>new ApiError(404,'NOT_FOUND','항목을 찾을 수 없습니다.');
    const values=[request.params,request.query,request.body].filter(v=>v&&typeof v==='object') as Record<string,unknown>[];
    for(const input of values){
      if('userId' in input)throw new ApiError(400,'USER_ID_FORBIDDEN','사용자 식별자는 서버에서 결정합니다.');
      for(const [key,parent,where] of [
        ['accountId','account',{userId:uid}],['buyTradeId','buyTrade',{account:{userId:uid}}],['sellTradeId','sellTrade',{buyTrade:{account:{userId:uid}}}],
      ] as const)if(input[key]!==undefined){
        if(!/^\d{1,20}$/.test(String(input[key])))throw notFound();
        if(!await (prisma as any)[parent].findFirst({where:{id:BigInt(String(input[key])),...where},select:{id:true}}))throw notFound();
      }
    }
    const path=request.url.split('?')[0]!,trade=path.match(/^\/api\/(buy-trades|sell-trades)\/(\d+)$/);
    if(trade){const model=trade[1]==='buy-trades'?'buyTrade':'sellTrade',scope=model==='buyTrade'?{account:{userId:uid}}:{buyTrade:{account:{userId:uid}}};if(!await (prisma as any)[model].findFirst({where:{id:BigInt(trade[2]!),...scope},select:{id:true}}))throw notFound();}
  });
  // The continuation and all downstream promise callbacks inherit only this request's identity.
  app.addHook('preHandler',(request,_reply,done)=>request.auth?authContext.run(request.auth,done):done());
}
declare module 'fastify' {interface FastifyRequest {auth:AuthIdentity|null;}}
