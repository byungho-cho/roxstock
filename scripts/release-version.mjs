import {readFileSync,writeFileSync} from 'node:fs';
const path=new URL('../backend/src/release.json',import.meta.url);
const release=JSON.parse(readFileSync(path,'utf8'));
if(!/^1\.0\.\d+$/.test(release.version))throw Error('Invalid release version');
if(process.argv.includes('--bump')){
 release.version=`1.0.${Number(release.version.split('.').at(-1))+1}`;
 writeFileSync(path,JSON.stringify(release)+'\n');
}
console.log(release.version);
