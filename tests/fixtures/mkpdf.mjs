export function pdf(text,pages=1){const objs=[];const add=s=>{objs.push(s);return objs.length};
 // objetos: 1 catálogo, 2 páginas, 3 fuente, luego (página, contenido) por cada página
 add('<</Type/Catalog/Pages 2 0 R>>');add(`<</Type/Pages/Kids[${Array.from({length:pages},(_,i)=>`${4+i*2} 0 R`).join(' ')}]/Count ${pages}>>`);add('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>');
 for(let i=0;i<pages;i++){const t=typeof text==='function'?text(i):text;const st=t?`BT /F1 12 Tf 20 100 Td (${t.replace(/[()\\]/g,'')}) Tj ET`:'';
  add(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents ${5+i*2} 0 R/Resources<</Font<</F1 3 0 R>>>>>>`);add(`<</Length ${st.length}>>\nstream\n${st}\nendstream`);}
 let o='%PDF-1.4\n';const off=[];objs.forEach((s,i)=>{off.push(o.length);o+=`${i+1} 0 obj\n${s}\nendobj\n`});
 const x=o.length;o+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<</Size ${objs.length+1}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`;
 return Buffer.from(o,'latin1')}
