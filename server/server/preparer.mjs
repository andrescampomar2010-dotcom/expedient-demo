import ExcelJS from 'exceljs';
import {readSheet,pickSheets,splitMergedValues,allocateExact} from './vendor/processor-parser.mjs';
export const PREPARER={name:'Customs Clearance Processor, parser subset',repository:'https://github.com/andrescampomar2010-dotcom/customs-clearance-processor',commit:'1e16e96609a0716b4836248da8b0566c0d2f497e',scope:'readSheet, pickSheets, splitMergedValues and dependencies; allocateExact for exact apportionment. No historical rule base or provider classifier copied.'};
export async function parseAttachment(attachment){
 if(attachment.type!=='xlsx')throw Error('UNSUPPORTED_ATTACHMENT_FORMAT');const buf=Buffer.from(attachment.contentBase64,'base64');if(buf.length>1000000)throw Error('ATTACHMENT_LIMIT');
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buf);const {inv,pck}=pickSheets(wb);if(!inv||!pck||inv===pck)throw Error('INVOICE_AND_PACKING_REQUIRED');
 const I=readSheet(inv),P=readSheet(pck);splitMergedValues(I.rows,I.mmap,I.map);splitMergedValues(P.rows,P.mmap,P.map);
 if(!I.rows.length||!P.rows.length)throw Error('NO_DOCUMENT_LINES');
 const evidence={preparer:PREPARER,invoiceSheet:inv.name,packingSheet:pck.name,invoiceColumns:I.map,packingColumns:P.map};
 return {invoice:I.rows.map(r=>({ref:r.ref,description:r.desc,units:r.qty==null?null:Number(r.qty),value:r.amount==null?null:Number(r.amount),material:r.material||'',row:r._row})),packing:P.rows.map(r=>({ref:r.ref,units:r.qty==null?null:Number(r.qty),net:r.nw==null?null:Number(r.nw),gross:r.gw==null?null:Number(r.gw),packages:r.ctns==null?null:Number(r.ctns),row:r._row})),evidence};
}
export async function createWorkbook(kind='complete'){
 const wb=new ExcelJS.Workbook();wb.creator='Synthetic fixture generator';wb.created=new Date('2026-01-01T00:00:00Z');wb.modified=wb.created;
 const invoice=wb.addWorksheet('INVOICE');invoice.addRow(['REF','DESCRIPTION','QUANTITY','AMOUNT','MATERIAL']);invoice.addRow(['1001','Graphite pencil with fixed sheath, writing use',100,120,'wood sheath, graphite core']);invoice.addRow(['1002','Mechanical pencil, writing use',50,100,'plastic and metal mechanism']);
 const packing=wb.addWorksheet('PACKING LIST');packing.addRow(['REF','QUANTITY','CTNS','GROSS WEIGHT','NET WEIGHT']);packing.addRow(['1002',kind==='discrepancy'?48:50,1,6,5]);packing.addRow(['1001',100,2,12,10]);
 if(kind==='missing')wb.removeWorksheet(packing.id);
 const buf=await wb.xlsx.writeBuffer();return {name:'invoice-packing-synthetic.xlsx',type:'xlsx',contentBase64:Buffer.from(buf).toString('base64')};
}
export {allocateExact};
