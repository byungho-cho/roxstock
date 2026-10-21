import type {FastifyInstance} from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';
export const maskAccount=(value:string|null)=>value?value.length<=4?'*'.repeat(value.length):'*'.repeat(Math.min(value.length-4,12))+value.slice(-4):'미등록';
const select={id:true,email:true,verifiedAt:true,mustChangePassword:true,createdAt:true} as const;
const serialize=(u:{id:bigint;email:string;verifiedAt:Date|null;mustChangePassword:boolean;createdAt:Date})=>({id:String(u.id),email:u.email,status:!u.verifiedAt?'이메일 미인증':u.mustChangePassword?'비밀번호 변경 필요':'정상',createdAt:u.createdAt.toISOString()});
export async function adminUserRoutes(app:FastifyInstance){
 app.addHook('preHandler',async req=>{if(req.auth?.role!=='ADMIN')throw new ApiError(403,'ADMIN_REQUIRED','관리자만 사용할 수 있습니다.');});
 app.get<{Querystring:{cursor?:string}}>('/admin/users',async(req,reply)=>{
  const cursor=req.query.cursor;let boundary={};if(cursor){const row=await prisma.authUser.findUnique({where:{id:id(cursor,'cursor')},select:{id:true,createdAt:true}});if(!row)throw new ApiError(400,'INVALID_CURSOR','목록을 다시 조회해 주세요.');boundary={OR:[{createdAt:{lt:row.createdAt}},{createdAt:row.createdAt,id:{lt:row.id}}]};}
  const rows=await prisma.authUser.findMany({where:boundary,select,orderBy:[{createdAt:'desc'},{id:'desc'}],take:31});
  await prisma.adminUserReadAudit.create({data:{actorId:req.auth!.userId,action:'LIST'}});reply.header('Cache-Control','private, no-store');return {data:{items:rows.slice(0,30).map(serialize),nextCursor:rows.length>30?String(rows[29]!.id):null}};
 });
 app.get<{Params:{subjectId:string};Querystring:{accountCursor?:string}}>('/admin/users/:subjectId',async(req,reply)=>{
  const subjectId=id(req.params.subjectId,'subjectId');const user=await prisma.authUser.findUnique({where:{id:subjectId},select});if(!user)throw new ApiError(404,'NOT_FOUND','사용자를 찾을 수 없습니다.');
  const accounts=await prisma.account.findMany({where:{userId:subjectId,...(req.query.accountCursor?{id:{gt:id(req.query.accountCursor,'accountCursor')}}:{})},select:{id:true,brokerName:true,accountNumber:true,isDefault:true},orderBy:{id:'asc'},take:101});
  await prisma.adminUserReadAudit.create({data:{actorId:req.auth!.userId,subjectId,action:'DETAIL'}});reply.header('Cache-Control','private, no-store');return {data:{...serialize(user),accounts:accounts.slice(0,100).map(a=>({id:String(a.id),brokerName:a.brokerName,accountNumber:maskAccount(a.accountNumber),isDefault:a.isDefault})),nextAccountCursor:accounts.length>100?String(accounts[99]!.id):null}};
 });
}
