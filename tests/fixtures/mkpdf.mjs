export function pdf(text){const objs=[];const add=s=>{objs.push(s);return objs.length};
 add('<</Type/Catalog/Pages 2 0 R>>');add('<</Type/Pages/Kids[3 0 R]/Count 1>>');
 add('<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>');
 const st=text?`BT /F1 12 Tf 20 100 Td (${text.replace(/[()\\]/g,'')}) Tj ET`:'';
 add(`<</Length ${st.length}>>\nstream\n${st}\nendstream`);add('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>');
 let o='%PDF-1.4\n';const off=[];objs.forEach((s,i)=>{off.push(o.length);o+=`${i+1} 0 obj\n${s}\nendobj\n`});
 const x=o.length;o+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<</Size ${objs.length+1}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`;
 return Buffer.from(o,'latin1')}
