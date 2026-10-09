import type {Prisma} from '../generated/prisma/index.js';
import {ApiError} from '../lib/api-error.js';
import {accountConnections} from './account-connections.js';

/** Caller supplies a Serializable transaction. Parent X lock blocks FK inserts until commit. */
export async function deleteEmptyAccount(tx:Prisma.TransactionClient,accountId:bigint) {
 // Consistent order also serializes default reassignment and concurrent account creation.
 await tx.$queryRaw`SELECT id FROM accounts ORDER BY id FOR UPDATE`;
 const account=await tx.account.findUnique({where:{id:accountId}});
 if(!account||!account.isActive)throw new ApiError(404,'ACCOUNT_NOT_FOUND','계좌를 찾을 수 없습니다.');
 if((await accountConnections(tx,accountId)).hasData)throw new ApiError(409,'ACCOUNT_HAS_DATA','연결 데이터가 있습니다. 상태를 다시 확인하고 먼저 초기화해 주세요.');
 await tx.account.delete({where:{id:accountId}});
 const remaining=await tx.account.findMany({where:{isActive:true},orderBy:[{isDefault:'desc'},{displayOrder:'asc'},{id:'asc'}]});
 const next=remaining[0];
 if(next&&!remaining.some(a=>a.isDefault))await tx.account.update({where:{id:next.id},data:{isDefault:true}});
 return {accountId:accountId.toString(),nextAccountId:next?.id.toString()??null};
}
