import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('.',import.meta.url);const read=p=>readFileSync(new URL(p,root),'utf8');
const core=read('web/core.mjs').replaceAll('export ','');
const integration=read('web/integration.mjs').replace('export function','function');
const app=read('web/app.mjs').replace("import * as C from './core.mjs';",'').replace("import {integrationUI} from './integration.mjs';",'');
const exports=['VERSION','uid','blank','newCase','audit','invalidate','totals','issues','propose','review','assign','csv','exportCase','parseCsv','sample'];
const code=`const C=(()=>{${core}\nreturn {${exports.join(',')}};})();\n${integration}\n${app}`;
const html=read('web/index.html').replace('<link rel="stylesheet" href="style.css">','<style>'+read('web/style.css')+'</style>').replace('<script type="module" src="app.mjs"></script>','<script>'+code.replaceAll('</script','<\\/script')+'</script>');
writeFileSync(new URL('Expedient_demo.html',root),html);writeFileSync(new URL('Expedient_demo.html.txt',root),html);console.log('Standalone demo built');
