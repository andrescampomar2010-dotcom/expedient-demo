// Comprobación y preparación del OCR local. Uso: npm run ocr:check  |  node scripts/ocr-setup.mjs --fetch [directorio]
// --fetch descarga UNA vez, en la instalación, el modelo español oficial tessdata_fast (Apache-2.0) y verifica su SHA-256.
// En ejecución la app no usa red para el OCR. Requiere instalar aparte tesseract-ocr y poppler-utils (ver docs/INSTALACION.md).
import {createHash} from 'node:crypto';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import {ocrAvailable} from '../server/ocr.mjs';
const SPA={url:'https://github.com/tesseract-ocr/tessdata_fast/raw/main/spa.traineddata',sha256:'6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464',bytes:2294433};
if(process.argv.includes('--fetch')){
 const dir=resolve(process.argv.find((a,i)=>i>2&&!a.startsWith('--'))||'data/tessdata');mkdirSync(dir,{recursive:true});
 const r=await fetch(SPA.url,{redirect:'follow',signal:AbortSignal.timeout(60000)});if(!r.ok){console.error('Descarga fallida: HTTP '+r.status);process.exit(1)}
 const b=Buffer.from(await r.arrayBuffer());const h=createHash('sha256').update(b).digest('hex');
 if(h!==SPA.sha256){console.error(`SHA-256 distinto del verificado (${h}). No se guarda. El fichero upstream pudo cambiar: revisar a mano.`);process.exit(1)}
 writeFileSync(resolve(dir,'spa.traineddata'),b);console.log('spa.traineddata guardado en '+dir+'. Añade también eng.traineddata (del paquete tesseract-ocr-eng) y exporta TESSDATA_PREFIX='+dir);
}
const a=await ocrAvailable();
if(a.ok){console.log('OCR disponible. Idiomas: '+a.lang);}else{console.log('OCR NO disponible: falta '+a.missing+'. Sin OCR, los PDF escaneados se marcan "no leído". Instala tesseract-ocr, tesseract-ocr-spa, poppler-utils (o usa --fetch para el idioma).');process.exitCode=2}
