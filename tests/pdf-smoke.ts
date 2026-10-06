import assert from 'node:assert/strict';
import {parsePdf,MATERIAL_READER_VERSION} from '../src/main/materials/pdf';
const text='Synthetic PDF validation';
const stream='BT /F1 20 Tf 72 700 Td ('+text+') Tj ET';
const objects=[
'<< /Type /Catalog /Pages 2 0 R >>',
'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
'<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream',
];
let pdf='%PDF-1.7\n',offsets=[0];
for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
const start=Buffer.byteLength(pdf);
pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
const bytes=Buffer.from(pdf),signal=new AbortController().signal;
(async()=>{
 const description=await parsePdf(bytes,{operation:'describe'},signal);
 assert.equal(description.pageCount,1);
 const read=await parsePdf(bytes,{operation:'read',page:1},signal);
 assert(read.text?.includes(text));
 const rendered=await parsePdf(bytes,{operation:'render',page:1},signal);
 assert(rendered.image?.dataUrl.startsWith('data:image/jpeg;base64,'));
 assert(rendered.image.width>0&&rendered.image.height>0);
 console.log(JSON.stringify({status:'passed',scope:'native PDF describe, actual text extraction and JPEG rendering',reader:MATERIAL_READER_VERSION,pages:1,width:rendered.image.width,height:rendered.image.height}));
})().catch(error=>{console.error(error);process.exitCode=1;});

