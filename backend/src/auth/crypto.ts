import {createHash, randomBytes, scrypt as derive, timingSafeEqual} from 'node:crypto';
const scrypt=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export const randomToken=()=>randomBytes(32).toString('base64url');
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function validPassword(value:unknown):value is string {
  return typeof value==='string'&&/^[!-~]{8,20}$/.test(value)&&
    [/[A-Za-z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(pattern=>pattern.test(value)).length>=2;
}
export async function passwordHash(password:string){
  const salt=randomBytes(32).toString('hex');
  const key=await scrypt(password,salt);
  return `scrypt$32768$${salt}$${key.toString('hex')}`;
}
export async function passwordMatches(password:string,stored:string){
  const [algorithm,cost,salt,expected]=stored.split('$');
  if(algorithm!=='scrypt'||cost!=='32768'||!salt||!expected||!/^[a-f0-9]{128}$/.test(expected))return false;
  const key=await scrypt(password,salt);
  return timingSafeEqual(key,Buffer.from(expected,'hex'));
}
