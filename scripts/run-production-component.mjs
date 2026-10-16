import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Never stream a shell program into a deployment whose Docker children can read stdin.
export function runProductionComponent(sha,component,keyFile=join(homedir(),'.ssh','deploy_key'),env=process.env,execute=execFileSync){
 if(!/^[0-9a-f]{40}$/.test(sha??'')||!['backend','collector','frontend','investor-crawler'].includes(component))throw Error('Immutable SHA and known component required');
 const host=env.DEPLOY_HOST,user=env.DEPLOY_USER,port=env.DEPLOY_PORT||'22';
 if(!/^[A-Za-z0-9_.-]+$/.test(host??'')||!/^[A-Za-z0-9_-]+$/.test(user??'')||!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw Error('Invalid deployment connection');
 const directory='/opt/roxstock/.deploy/launchers',target=`${directory}/${sha}-${component}-${randomUUID()}.sh`,destination=user+'@'+host;
 // A graceful DART shutdown can be silent for 12 minutes. Keep idle network
 // connections alive without shortening that shutdown or bypassing the lock.
 const options=['-i',keyFile,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=6'];
 const ssh=[...options,'-p',port,destination];
 const source=component==='investor-crawler'?'scripts/deploy-investor-crawler.sh':'scripts/deploy-production-component.sh';
 const stdio=['ignore','inherit','inherit'];
 execute('ssh',[...ssh,`install -d -m 700 '${directory}'`],{stdio,env});
 execute('scp',[...options,'-P',port,source,`${destination}:${target}`],{stdio,env});
 execute('ssh',[...ssh,`chmod 600 '${target}' && exec bash '${target}' '${sha}' '${component}' </dev/null`],{stdio,env});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runProductionComponent(process.argv[2],process.argv[3],process.argv[4]);
