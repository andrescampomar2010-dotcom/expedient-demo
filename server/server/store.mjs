import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {blank} from '../web/core.mjs';
export async function openStore(path){
 let current={revision:0,state:blank()};try{current=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 let queue=Promise.resolve();
 return {read(){return structuredClone(current)},async write(expected,state){const work=queue.then(async()=>{
  if(expected!==current.revision)throw Error('REVISION_CONFLICT');
  if(!state||state.version!=='0.1.0'||!['cases','notices','drafts','knowledge','history'].every(k=>Array.isArray(state[k])))throw Error('INVALID_STATE');
  if(state.cases.length>500||state.knowledge.length>1000)throw Error('DEMO_LIMIT');
  const next={revision:current.revision+1,state};await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(next),{mode:0o600});await rename(path+'.tmp',path);current=structuredClone(next);return this.read();});queue=work.catch(()=>{});return work;}};
}
