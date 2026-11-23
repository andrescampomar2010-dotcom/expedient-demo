// Derived subset of MIT-licensed public project. See LICENSE-processor and provenance documentation.
function cellVal(c){
  let v=c.value;
  if(v && typeof v==='object'){
    if('result' in v) v=v.result;
    else if('richText' in v) v=v.richText.map(t=>t.text).join('');
    else if('text' in v) v=v.text;
    else if(v instanceof Date) return v;
  }
  return v;
}
function normHdr(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim().toUpperCase(); }
const ROLE_PATTERNS=[
  ['plastic',  [/WEIGHT\s*OF\s*PLASTIC/,/PLASTIC\s*PACKAGE/,/^PLASTICO$/,/^PLASTIC$/,/PESO\s*PL[ÁA]STICO/]],
  ['unitCtns', [/UNIT\s*CTNS/,/CTNS\s*\/\s*UNIT/,/PCS\s*\/\s*CTN/]],
  ['unitPrice',[/UNIT\s*PRICE/,/PRECIO\s*UNIT/,/单价/]],
  ['barcode',  [/BAR\s*CODE/,/BARCODE/,/\bEAN\b/,/\bUPC\b/,/C[ÓO]DIGO\s*DE\s*BARRAS/,/条形码/]],
  ['ref',      [/ARTICLE\s*NO/,/ITEM\s*NO/,/ITRM\s*NO/,/^ART\s*NO/,/^REFERENCIA$/,/^REF$/,
                /ART[ÍI]CULO/,/^C[ÓO]DIGO$/,/货号/,/^MODELO$/,/PRODUCT\s*MODEL/]],
  ['desc',     [/DESCRIPTION/,/DESCRIPCI[ÓO]N/,/^DESCRIPCION$/,/DESCRIPTION\s*OF\s*GOODS/,
                /名称及规格/,/品名/,/COMMODITY/,/^GOODS$/,/^PRODUCTO$/]],
  ['material', [/^MATERIAL/,/MATERIA\s*PRIMA/,/COMPOSICI[ÓO]N/,/^TEXTURE$/,/材质/,/材料/]],
  ['hs',       [/H\.?\s*S\.?\s*CODE/,/^HS$/,/^PARTIDA/,/ARANCEL/,/TARIC/,/C[ÓO]DIGO\s*ADUANERO/,/海关编码/]],
  ['ctns',     [/^CTNS?$/,/^TOTAL\s*CTNS?$/,/^CTN\b/,/CARTON/,/CARTINS/,/^CT$/,/^BULTOS/,/^CAJAS/,/箱数/,/^PKG$/]],
  ['gw',       [/G\.?\s*W\.?/,/GROSS\s*WEIGHT/,/PESO\s*BRUTO/,/G\.?WT/,/毛重/]],
  ['nw',       [/N\.?\s*W\.?/,/NET\s*WEIGHT/,/PESO\s*NETO/,/N\.?WT/,/净重/]],
  ['meas',     [/MEAS/,/\bCBM\b/,/VOLUME/,/体积/]],
  ['qty',      [/QUANTITY/,/^QTY/,/\(PCS\)/,/^PCS$/,/UNIDADES/,/UNDIADES/,/CANTIDAD/,/数量/]],
  ['amount',   [/^AMOUNT/,/TOTAL\s*AMOUNT/,/^PRECIO$/,/^PRICE$/,/^IMPORTE/,/^VALOR/,/总价/,/金额/]],
  
  ['total',    [/^TOTAL$/,/^TOTAL\s*(?:PCS|QTY|UNITS|UNIDADES)$/,/TTL\.?\s*QTY/,/总件数/]],
];
function detectColumns(ws,maxScan){
  maxScan=maxScan||30;
  const lastRow=Math.min(ws.rowCount||maxScan,maxScan);
  const scanW=Math.min(Math.max(ws.columnCount||0,20),40);
  
  const numCount=[];
  for(let r=1;r<=lastRow;r++){
    let k=0;
    for(let c=1;c<=scanW;c++) if(toNum(cellVal(ws.getRow(r).getCell(c)))!=null) k++;
    numCount[r]=k;
  }
  const headerLike=r=>numCount[r]<=1;
  let best=null;
  for(let r=1;r<=lastRow;r++){
    for(let depth=1;depth<=3;depth++){
      let allHdr=true;
      for(let rr=r;rr<r+depth && rr<=lastRow;rr++) if(!headerLike(rr)){ allHdr=false; break; }
      if(!allHdr) continue;
      const map={};
      const width=Math.min(Math.max(ws.columnCount||0,20),40);
      for(let cix=1;cix<=width;cix++){
        const parts=[];
        for(let rr=r;rr<r+depth && rr<=lastRow;rr++){
          const t=normHdr(cellVal(ws.getRow(rr).getCell(cix)));
          if(t) parts.push(t);
        }
        const h=parts.join(' ').trim();
        if(!h||h.length>60) continue;
        for(const [role,pats] of ROLE_PATTERNS){
          if(map[role]!==undefined) continue;
          if(pats.some(p=>p.test(h))){ map[role]=cix; break; }
        }
      }
      const score=Object.keys(map).length;
      
      if(score>=3 && (best===null || score>best.score ||
                      (score===best.score && depth<best.depth))){
        best={score:score,map:map,headerRow:r+depth-1,depth:depth};
      }
    }
  }
  if(!best) return {map:{},headerRow:0};
  return {map:best.map,headerRow:best.headerRow};
}
const NON_PRODUCT=/\b(TOTAL|EXPORTER|SHIPPER|CONSIGNEE|NOTIFY|REMARK|SIGNATURE|SAY\s|SUBTOTAL)\b/i;
function isRefLike(v){
  if(v==null) return false;
  const s=String(v).trim();
  if(!s||NON_PRODUCT.test(s)) return false;
  return /^[A-Za-z]?\d{3,}$/.test(s);
}
function refKey(v){ return v==null?'':String(v).trim(); }
function toNum(v){
  if(v==null||v==='') return null;
  if(typeof v==='number') return v;
  const s=String(v).replace(/[^\d.,-]/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.');
  const n=parseFloat(s);
  return isNaN(n)?null:n;
}
function cloneColor(col){
  if(!col) return null;
  const o={};
  if(col.argb) o.argb=col.argb;
  if(col.theme!==undefined) o.theme=col.theme;
  if(col.tint!==undefined) o.tint=col.tint;
  if(col.indexed!==undefined) o.indexed=col.indexed;
  return Object.keys(o).length?o:null;
}
function rgbOf(argb){
  if(!argb||typeof argb!=='string') return null;
  const h=argb.length===8?argb.slice(2):argb;
  if(h.length!==6||!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}
function isGreyish(argb){
  const c=rgbOf(argb);
  return !!c && (Math.max(...c)-Math.min(...c))<24;
}
function isWhiteish(argb){
  const c=rgbOf(argb);
  return !!c && c[0]>245 && c[1]>245 && c[2]>245;
}
function cellPaint(cell){
  if(!cell) return null;
  const f=cell.fill;
  if(!f || f.type!=='pattern' || !f.pattern || f.pattern==='none') return null;
  const fg=f.fgColor;
  if(!fg) return null;
  if(fg.argb!==undefined){
    if(/^0{6,8}$/.test(fg.argb)) return null;          
    if(isWhiteish(fg.argb)) return null;               
    if(isGreyish(fg.argb) && fg.pattern!=='solid') return null;
    if(isWhiteish(fg.argb)) return null;
    return {type:'pattern',pattern:f.pattern,fgColor:cloneColor(fg),bgColor:cloneColor(f.bgColor)||undefined};
  }
  if(fg.theme!==undefined){
    
    const tinted = fg.tint!==undefined && Math.abs(fg.tint)>0.02;
    if(fg.theme<=1 && !tinted) return null;
    return {type:'pattern',pattern:f.pattern,fgColor:cloneColor(fg),bgColor:cloneColor(f.bgColor)||undefined};
  }
  if(fg.indexed!==undefined){
    if(fg.indexed===64||fg.indexed===65) return null;  
    return {type:'pattern',pattern:f.pattern,fgColor:cloneColor(fg),bgColor:cloneColor(f.bgColor)||undefined};
  }
  return null;
}
function fontPaint(cell){
  if(!cell||!cell.font||!cell.font.color) return null;
  const fc=cell.font.color;
  if(fc.argb!==undefined) return isGreyish(fc.argb)?null:cloneColor(fc);
  if(fc.theme!==undefined && fc.theme>1) return cloneColor(fc);
  return null;
}
function grabRowStyle(row,map){
  const cols=[];
  for(const role of ['desc','ref','material','hs','barcode']){
    if(map[role]!==undefined) cols.push(map[role]);
  }
  let fill=null, fontColor=null;
  for(const ci of cols){
    const cell=row.getCell(ci);
    if(!fill){ const p=cellPaint(cell); if(p) fill=p; }
    if(!fontColor){ const fp=fontPaint(cell); if(fp) fontColor=fp; }
  }
  if(!fill && !fontColor) return null;
  const out={};
  if(fill) out.fill=fill;
  if(fontColor) out.fontColor=fontColor;
  return out;
}
function mergeMapOf(ws){
  const map={};                       
  const list=(ws.model&&ws.model.merges)||[];
  for(const ref of list){
    const m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(ref));
    if(!m) continue;
    const colNum=s=>{let n=0;for(const ch of s)n=n*26+(ch.charCodeAt(0)-64);return n;};
    const top=+m[2],bottom=+m[4],left=colNum(m[1]),right=colNum(m[3]);
    for(let r=top;r<=bottom;r++) for(let cc=left;cc<=right;cc++) map[r+':'+cc]={top,bottom,left,right};
  }
  return map;
}
function isMergedFollower(mmap,row,col){
  const m=mmap[row+':'+col];
  return !!(m && m.bottom>m.top && row>m.top);
}
function splitMergedValues(rows,mmap,map,logFn){
  const roles=['ctns','gw','nw','qty','total','amount'];
  const intRoles={ctns:true};
  let blocks=0;
  for(const role of roles){
    const col=map[role];
    if(col===undefined) continue;
    const done={};
    for(const r of rows){
      const m=mmap[r._row+':'+col];
      if(!m || m.bottom<=m.top) continue;         
      if(done[m.top]) continue;
      done[m.top]=true;
      const group=rows.filter(x=>x._row>=m.top && x._row<=m.bottom);
      if(group.length<2) continue;
      const total=toNum(group[0][role]);
      if(total==null){ group.forEach(g=>{ g[role]=null; }); continue; }
      blocks++;
      
      let w=group.map(g=>toNum(g.qty)||toNum(g.total)||0);
      if(!w.some(x=>x>0)) w=group.map(()=>1);
      const sw=w.reduce((a,b)=>a+b,0);
      if(intRoles[role]){
        
        const raw=w.map(x=>total*x/sw);
        const base=raw.map(x=>Math.floor(x));
        let rest=Math.round(total-base.reduce((a,b)=>a+b,0));
        const order=raw.map((x,i)=>[x-Math.floor(x),i]).sort((a,b)=>b[0]-a[0]);
        for(let i=0;i<order.length && rest>0;i++,rest--) base[order[i][1]]++;
        group.forEach((g,i)=>{ g[role]=base[i]; g._merged=(g._merged||[]).concat(role); });
      } else {
        group.forEach((g,i)=>{ g[role]=Math.round(total*w[i]/sw*1000)/1000; g._merged=(g._merged||[]).concat(role); });
      }
    }
  }
  if(blocks && logFn) logFn('Celdas combinadas: '+blocks+' valor(es) repartidos entre sus artículos','warn');
  return blocks;
}
function readSheet(ws){
  const {map,headerRow}=detectColumns(ws);
  const mmap=mergeMapOf(ws);
  if(map.ref===undefined && map.desc===undefined) return {map:map,rows:[],headerRow:headerRow,mmap:mmap};
  const numRoles=['qty','total','ctns','gw','nw','amount','unitPrice','unitCtns'];
  const rows=[]; let stopped=false;
  ws.eachRow({includeEmpty:false},(row,rn)=>{
    if(rn<=headerRow || stopped) return;
    const rawRef=map.ref!==undefined? cellVal(row.getCell(map.ref)) : null;
    const rawDesc=map.desc!==undefined? cellVal(row.getCell(map.desc)) : null;
    
    const rv=(map.ref!==undefined && isMergedFollower(mmap,rn,map.ref))? null : rawRef;
    const dv=(map.desc!==undefined && isMergedFollower(mmap,rn,map.desc))? null : rawDesc;
    const refOk=isRefLike(rv);
    let numeric=0;
    for(const role of numRoles){
      if(map[role]===undefined) continue;
      if(toNum(cellVal(row.getCell(map[role])))!=null) numeric++;
    }
    const textBlob=[rv,dv].map(x=>x==null?'':String(x)).join(' ');
    
    if(NON_PRODUCT.test(textBlob)){ if(rows.length) stopped=true; return; }
    
    if(!refOk && (numeric<2 || dv==null || !String(dv).trim())) return;
    const o={ref:refKey(rv),_row:rn,_noRef:!refOk};
    for(const role in map){
      if(role==='ref') continue;
      o[role]=cellVal(row.getCell(map[role]));
    }
    o._descStyle=grabRowStyle(row,map);
    rows.push(o);
  });
  const rowRef={};
  for(const r of rows) if(r.ref) rowRef[r._row]=r.ref;
  return {map:map,rows:rows,headerRow:headerRow,mmap:mmap,rowRef:rowRef};
}
function pickSheets(wb){
  
  
  
  
  const OURS=/^(TABLE\s*1|DOSSIER|SANIDAD|CAMBIOS|PDA_MAP)$/i;
  const usable=wb.worksheets.filter(ws=>!OURS.test(String(ws.name||'').trim()));
  const pool=usable.length?usable:wb.worksheets;
  let inv=null,pck=null,pic=null;
  
  for(const ws of pool){
    const n=normHdr(ws.name);
    if(!pic && /图片|材质|PICTURE\+|FOTO\s*\+|IMAGEN\s*\+/.test(n)) { pic=ws; continue; }
  }
  for(const ws of pool){
    if(ws===pic) continue;
    const n=normHdr(ws.name);
    if(!inv && /INVOICE|FACTURA|^INC$|发票/.test(n)) { inv=ws; continue; }
    if(!pck && /PACKING|PAKING|^PL$|PACK|BULTOS|箱单|装箱/.test(n)) { pck=ws; continue; }
    if(!pic && /\bPIC\b|PICTURE|^FOTO$|IMAGE/.test(n)) { pic=ws; continue; }
  }
  const rest=pool.filter(w=>w!==inv&&w!==pck&&w!==pic);
  if(!inv) inv=rest.shift()||pool[0];
  if(!pck) pck=rest.shift()||inv;
  if(!pic){
    for(const ws of rest){
      const {map}=detectColumns(ws);
      if(map.ref!==undefined && (map.material!==undefined || map.hs!==undefined)){ pic=ws; break; }
    }
  }
  
  if(!pic && pck){
    const {map}=detectColumns(pck);
    if(map.ref!==undefined && (map.material!==undefined || map.hs!==undefined)) pic=pck;
  }
  return {inv:inv,pck:pck,pic:pic};
}
function allocateExact(values,total,dec){
  const p=Math.pow(10,dec);
  const target=Math.round((total||0)*p);
  const sum=values.reduce((a,v)=>a+(v||0),0);
  if(!values.length||sum<=0||!isFinite(target)) return values.map(()=>0);
  const raw=values.map(v=>(v||0)/sum*target);
  const base=raw.map(x=>Math.floor(x+1e-9));
  let rest=target-base.reduce((a,b)=>a+b,0);
  const order=raw.map((x,i)=>[x-Math.floor(x+1e-9),i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);
  for(let k=0;k<order.length&&rest>0;k++,rest--) base[order[k][1]]++;
  return base.map(x=>x/p);
}
export {readSheet,pickSheets,splitMergedValues,allocateExact};
