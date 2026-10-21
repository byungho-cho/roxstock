import {readFile} from 'node:fs/promises';
import {createSign} from 'node:crypto';
let cached:{token:string;until:number}|undefined;
export const pushConfigured=()=>!!process.env.FCM_SERVICE_ACCOUNT_FILE;
export async function sendPush(token:string,data:Record<string,string>):Promise<'SENT'|'INVALID'|'RETRY'|'CONFIGURATION'> {
 try {
  const credentials=JSON.parse(await readFile(process.env.FCM_SERVICE_ACCOUNT_FILE!,'utf8'));
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(credentials.project_id))return 'CONFIGURATION';
  if(!cached||cached.until<Date.now()){
   const now=Math.floor(Date.now()/1000),encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
   const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
   const sign=createSign('RSA-SHA256');sign.update(unsigned);const assertion=unsigned+'.'+sign.sign(credentials.private_key,'base64url');
   const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)return 'CONFIGURATION';const payload=await response.json() as {access_token?:string;expires_in?:number};if(!payload.access_token)return 'CONFIGURATION';cached={token:payload.access_token,until:Date.now()+Math.min(payload.expires_in??3600,3600)*1000-60000};
  }
  // Data-only: Android verifies the current binding and deduplicates before display.
  const response=await fetch(`https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${cached.token}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token,data,android:{priority:'HIGH',ttl:'600s'}}}),signal:AbortSignal.timeout(10000)});
  if(response.ok)return 'SENT';
  const payload=await response.json() as {error?:{details?:{errorCode?:string}[]}};
  if(payload.error?.details?.some(d=>['UNREGISTERED','INVALID_ARGUMENT'].includes(d.errorCode??'')))return 'INVALID';
  if(response.status===401||response.status===403){cached=undefined;return 'CONFIGURATION';}return 'RETRY';
 }catch{return 'RETRY';}
}
