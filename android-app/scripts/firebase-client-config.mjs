import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export function firebaseClientEnvironment(config){
 if(!config||config.type==='service_account'||JSON.stringify(config).includes('"private_key"'))throw Error('Android app configuration required; server credentials are forbidden');
 const clients=config.client?.filter(c=>c.client_info?.android_client_info?.package_name==='com.roxstock.app.debug');
 if(clients?.length!==1)throw Error('Expected exactly one matching Android package');
 const client=clients[0],info=config.project_info;
 if(info?.project_id!=='roxstock-ef8ef'||String(info?.project_number)!=='176267262855'||client.client_info.mobilesdk_app_id!=='1:176267262855:android:e834d260b28a38479ef122')throw Error('Firebase project, sender or app identity mismatch');
 const key=client.api_key?.[0]?.current_key;
 if(typeof key!=='string'||!/^AIza[A-Za-z0-9_-]{20,}$/.test(key))throw Error('Missing or invalid Android API key');
 return {ROXSTOCK_FCM_APP_ID:client.client_info.mobilesdk_app_id,ROXSTOCK_FCM_PROJECT_ID:info.project_id,ROXSTOCK_FCM_SENDER_ID:String(info.project_number),ROXSTOCK_FCM_API_KEY:key};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node firebase-client-config.mjs <google-services.json> <private-output-outside-repository.json>');
  const env=firebaseClientEnvironment(JSON.parse(readFileSync(input,'utf8')));
  const repository=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
  mkdirSync(dirname(resolve(output)),{recursive:true,mode:0o700});
  const parent=realpathSync(dirname(resolve(output))),rel=relative(repository,parent);
  if(!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('Private output must be outside the repository');
  writeFileSync(output,JSON.stringify(env)+'\n',{mode:0o600,flag:'wx'});
  console.log('Firebase app identity verified; private build environment saved. API key not printed.');
 }catch{console.error('Firebase configuration import failed; check input identity and private output path. No values logged.');process.exitCode=1;}
}
