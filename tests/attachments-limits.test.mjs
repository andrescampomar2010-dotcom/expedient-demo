import test from 'node:test';import assert from 'node:assert/strict';
import {readAttachment,LIMITS} from '../server/attachments.mjs';import {pdf} from './fixtures/mkpdf.mjs';
// PDF cifrado (clave de usuario) generado con qpdf, AES-256; el texto interno no debe aparecer nunca.
const ENC=Buffer.from('JVBERi0xLjcKJb/3ov4KMSAwIG9iago8PCAvRXh0ZW5zaW9ucyA8PCAvQURCRSA8PCAvQmFzZVZlcnNpb24gLzEuNyAvRXh0ZW5zaW9uTGV2ZWwgOCA+PiA+PiAvUGFnZXMgMiAwIFIgL1R5cGUgL0NhdGFsb2cgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcyA+PgplbmRvYmoKMyAwIG9iago8PCAvQ29udGVudHMgNCAwIFIgL01lZGlhQm94IFsgMCAwIDQwMCAyMDAgXSAvUGFyZW50IDIgMCBSIC9SZXNvdXJjZXMgPDwgL0ZvbnQgPDwgL0YxIDUgMCBSID4+ID4+IC9UeXBlIC9QYWdlID4+CmVuZG9iago0IDAgb2JqCjw8IC9MZW5ndGggMTEyIC9GaWx0ZXIgL0ZsYXRlRGVjb2RlID4+CnN0cmVhbQpO6qAbK+qjToWYSu5ZznG9frTPaTsFo0BGJhbMuD+NFt1hyyqja/6DUPL1Ayv7KtcqctUAaJeX0kHSBDuY1BfMtHM4BFQKWN+ax1mIRUCRGh5E9FUajah8fcovdiDuoh7nvsH5D51kMDvj2mq60JnFZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9CYXNlRm9udCAvSGVsdmV0aWNhIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udCA+PgplbmRvYmoKNiAwIG9iago8PCAvQ0YgPDwgL1N0ZENGIDw8IC9BdXRoRXZlbnQgL0RvY09wZW4gL0NGTSAvQUVTVjMgL0xlbmd0aCAzMiA+PiA+PiAvRmlsdGVyIC9TdGFuZGFyZCAvTGVuZ3RoIDI1NiAvTyA8MTgxMDY1ZTk2YzY0MzZmYTRlYjUzNjU4MWViZTZmN2IwMmYwMDE2YWUwNjk2ZjFjNTI5NjE0NTU0MWJmZjg4Y2RjNzM1OGRiY2RlODc4NGNjM2U4MWZiNzMxZDJhNjhhPiAvT0UgPDQ5ZmEwNWYzMmFhMjgzYWM5OTY1N2EwNDkxYjcwN2E2YWI5OGMzYzA2YTc0ODNhMjZiMGNmOGFhOTUzNGNjYTM+IC9QIC00IC9QZXJtcyA8YTNkN2EyNmM5YjEyN2M0MDU2NDYzZmYxYzExZTFiMWI+IC9SIDYgL1N0bUYgL1N0ZENGIC9TdHJGIC9TdGRDRiAvVSA8MWNjODQ5YzNjM2QyMTU5ZjZiZDAxOWQxM2NlY2YyZmIzYjgzNjFmYjNhZjNjN2EyNjNhZDA3Njg1OTBmOTliNWZkMTBiYWZkMDE5OTg5YTUxMTZlZDBhY2JhMzRjZjBlPiAvVUUgPDNmZDM3MTNiNDhkZTU3NGViNjMzNmExM2Y5MGI1NzA2MTljMDIwNGMyZTI1YjhhNmQ0Y2VkYzE2OTc3NGJlZWM+IC9WIDUgPj4KZW5kb2JqCnhyZWYKMCA3CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMTMwIDAwMDAwIG4gCjAwMDAwMDAxODkgMDAwMDAgbiAKMDAwMDAwMDMxNyAwMDAwMCBuIAowMDAwMDAwNTAwIDAwMDAwIG4gCjAwMDAwMDA1NzAgMDAwMDAgbiAKdHJhaWxlciA8PCAvUm9vdCAxIDAgUiAvU2l6ZSA3IC9JRCBbPGVkOWQ5MDNjY2Q4ODllZWYyMTI1ZTM5ZDdmNmI1MzA1PjxlZDlkOTAzY2NkODg5ZWVmMjEyNWUzOWQ3ZjZiNTMwNT5dIC9FbmNyeXB0IDYgMCBSID4+CnN0YXJ0eHJlZgoxMTE3CiUlRU9GCg==','base64');
test('PDF protegido con clave: estado protegido y sin texto',async()=>{
 const r=await readAttachment({name:'cifrado.pdf',bytes:ENC});assert.equal(r.status,'protegido');assert.equal(r.text,undefined);assert.ok(!JSON.stringify(r).includes('26ES0000999999'));
});
test('límite de páginas: solo se leen las primeras y se avisa',async()=>{
 const r=await readAttachment({name:'largo.pdf',bytes:pdf(i=>'pagina '+i+' con texto suficiente para contar',45)});
 assert.equal(r.status,'leido');assert.equal((r.text.match(/pagina/g)||[]).length,LIMITS.maxPages);assert.match(r.note,/parcialmente/);
});
test('límite de tamaño: no se llega a lanzar el análisis',async()=>{
 const r=await readAttachment({name:'x.pdf',bytes:Buffer.alloc(LIMITS.maxBytes+1)});assert.equal(r.status,'demasiado_grande');
});
test('tiempo: un análisis que no termina se cancela y el proceso sigue sano',async()=>{
 const t0=Date.now();
 const r=await readAttachment({name:'x.pdf',bytes:pdf('texto suficiente para pasar el umbral de lectura')},{...LIMITS,timeoutMs:300},new URL('./fixtures/hang-worker.mjs',import.meta.url));
 assert.equal(r.status,'error');assert.match(r.note,/cancel/);assert.ok(Date.now()-t0<3000,'vuelve poco después del límite');
 const ok=await readAttachment({name:'y.pdf',bytes:pdf('Texto normal con DUA 26ES0000111111 suficiente')});assert.equal(ok.status,'leido');
});
test('memoria: un análisis que agota la memoria se corta sin tumbar el proceso',async()=>{
 const r=await readAttachment({name:'x.pdf',bytes:pdf('texto suficiente para pasar el umbral de lectura')},{...LIMITS,timeoutMs:20000},new URL('./fixtures/memory-worker.mjs',import.meta.url));
 assert.equal(r.status,'error');assert.match(r.note,/pesado|cancel|No se pudo/);
});
