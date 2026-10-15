import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const services=['backend','collector','frontend'];
export function selectServices(paths,{before={},after={}}={}) {
  const selected=new Set();
  for(const p of paths) {
    if(p.endsWith('.md')||p==='backend/src/release.json')continue;
    if(/^(shared\/|database\/)/.test(p)) {selected.add('backend');selected.add('collector');}
    for(const s of services)if(p.startsWith(s+'/'))selected.add(s);
    if(/^(infra\/|compose[^/]*\.ya?ml$|\.dockerignore$|scripts\/deploy[^/]*\.(sh|mjs)$|\.github\/workflows\/(production-deploy|backend-deploy|collector-deploy|frontend-image)\.yml$)/.test(p))for(const s of services)selected.add(s);
    if(p==='package.json')for(const s of services)selected.add(s);
    if(p==='package-lock.json')for(const s of services)if(JSON.stringify(dependencies(before,s))!==JSON.stringify(dependencies(after,s)))selected.add(s);
  }
  return Object.fromEntries(services.map(s=>[s,selected.has(s)]));
}
function dependencies(lock,workspace) {
  const packages=lock.packages;if(!packages)return null;
  const found=new Map();
  function visit(key){
    if(found.has(key))return;const value=packages[key];if(!value)return;
    found.set(key,value);
    if(value.link){visit(value.resolved);return;}
    for(const name of Object.keys({...value.dependencies,...value.optionalDependencies,...value.devDependencies,...value.peerDependencies})) {
      let parent=key;
      while(true){const candidate=(parent?parent+'/':'')+'node_modules/'+name;if(packages[candidate]){visit(candidate);break;}if(!parent)break;parent=parent.includes('/')?parent.slice(0,parent.lastIndexOf('/')):'';}
    }
  }
  visit(workspace);
  return [...found].sort(([a],[b])=>a.localeCompare(b));
}
export function compareScope(base,head) {
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'});
  const lock=ref=>{try{return JSON.parse(git('show',ref+':package-lock.json'));}catch{return {};}};
  const paths=git('diff','--name-only','--no-renames',base,head).trim().split('\n');
  return selectServices(paths,{before:lock(base),after:lock(head)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [base,head]=process.argv.slice(2);
 if(!/^[0-9a-f]{40}$/.test(base??'')||!/^[0-9a-f]{40}$/.test(head??''))throw Error('Two immutable commit SHAs required');
 console.log(JSON.stringify(compareScope(base,head)));
}
