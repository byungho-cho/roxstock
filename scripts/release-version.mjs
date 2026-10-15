import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const path=new URL('../backend/src/release.json',import.meta.url);
const release=JSON.parse(readFileSync(path,'utf8'));
if(!/^1\.0\.\d+$/.test(release.version))throw Error('Invalid release version');
if(process.argv.includes('--bump')){
 release.version=`1.0.${Number(release.version.split('.').at(-1))+1}`;
 writeFileSync(path,JSON.stringify(release)+'\n');
}
const check=process.argv.indexOf('--check');
if(check>=0){
 const base=process.argv[check+1];
 if(!/^[0-9a-f]{40}$/.test(base??''))throw Error('Expected immutable base SHA');
 let previous;try{previous=JSON.parse(execFileSync('git',['show',`${base}:backend/src/release.json`],{encoding:'utf8',stdio:['ignore','pipe','ignore']})).version;}catch{}
 const files=execFileSync('git',['diff','--name-only',base,'HEAD'],{encoding:'utf8'}).split('\n');
 const codeChanged=files.some(p=>!p.endsWith('.md')&&/^(frontend\/|backend\/|collector\/|shared\/|database\/|infra\/|scripts\/deploy|package(-lock)?\.json$)/.test(p));
 const expected=previous?(codeChanged?`1.0.${Number(previous.split('.').at(-1))+1}`:previous):'1.0.31';
 if(release.version!==expected)throw Error(`Release ${release.version}; expected ${expected}. Run node scripts/release-version.mjs --bump once per code deployment.`);
}
console.log(release.version);
