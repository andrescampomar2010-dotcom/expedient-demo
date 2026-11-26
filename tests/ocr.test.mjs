import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readAttachment} from '../server/attachments.mjs';import {ocrAvailable} from '../server/ocr.mjs';
const d=mkdtempSync(join(tmpdir(),'scan-'));const gen=spawnSync('python3',['tests/fixtures/mkscan.py',d]);
const av=await ocrAvailable();const skip=!(gen.status===0&&av.ok)&&`OCR o generador (python3+Pillow) no disponible: ${av.missing||'generador'}`;
const rd=n=>readAttachment({name:n+'.pdf',bytes:readFileSync(join(d,n+'.pdf'))});
test('escaneo limpio: se lee por OCR, queda marcado no verificado y con pista de DUA',{skip},async()=>{
 const r=await rd('clean');assert.equal(r.status,'leido_ocr');assert.match(r.note,/no verificado/);
 assert.ok(r.ocr.hints.dua.includes('26ES00110012345678'));assert.ok(r.ocr.doubtful.length>=1,'los identificadores quedan como dudosos hasta confirmarse');assert.equal(r.text,undefined,'el texto OCR no entra como texto verificado');
});
test('escaneo ruidoso: no se inventa un DUA; lo ilegible queda como dudoso',{skip},async()=>{
 const r=await rd('noise');assert.equal(r.status,'leido_ocr');assert.equal(r.ocr.hints.dua.length,0);assert.ok(r.ocr.doubtful.length>10);
});
test('página en blanco: sin texto, no se da por leída',{skip},async()=>{assert.equal((await rd('blank')).status,'sin_texto')});
test('sin tesseract instalado: estado ocr_no_disponible con aviso',async()=>{
 const old=process.env.TESSERACT_BIN;process.env.TESSERACT_BIN='/no/existe/tesseract';
 try{const g=spawnSync('python3',['tests/fixtures/mkscan.py',d]);if(g.status!==0)return;const r=await rd('clean');assert.equal(r.status,'ocr_no_disponible');assert.match(r.note,/no disponible/);}finally{if(old===undefined)delete process.env.TESSERACT_BIN;else process.env.TESSERACT_BIN=old}
});
