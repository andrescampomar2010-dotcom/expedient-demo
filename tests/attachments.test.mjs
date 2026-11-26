import test from 'node:test';import assert from 'node:assert/strict';
import {readAttachment} from '../server/attachments.mjs';import {pdf} from './fixtures/mkpdf.mjs';
test('PDF digital: se lee el texto y aparece el DUA',async()=>{
 const b=pdf('Declaracion DUA 26ES0000123456 presentada y aceptada por la aduana');
 const r=await readAttachment({name:'dua.pdf',bytes:b});assert.equal(r.status,'leido');assert.match(r.text,/26ES0000123456/);
});
test('PDF sin texto (escaneo) se marca sin_texto y no aparenta lectura',async()=>{
 const r=await readAttachment({name:'scan.pdf',bytes:pdf('')});assert.equal(r.status,'sin_texto');assert.equal(r.text,undefined);assert.match(r.note,/OCR/);
});
test('fallos: demasiado grande, corrupto, tipo no soportado',async()=>{
 assert.equal((await readAttachment({name:'x.pdf',size:9e6,bytes:Buffer.alloc(10)})).status,'demasiado_grande');
 assert.equal((await readAttachment({name:'x.pdf',bytes:Buffer.from('esto no es un pdf')})).status,'error');
 assert.equal((await readAttachment({name:'x.docx',bytes:Buffer.alloc(3)})).status,'no_soportado');
});
