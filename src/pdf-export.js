const {buildImageHtml}=require('./image-export');

// CSS pixels are converted by Chromium at 96 dpi; preview and print share this layout.
function pdfLayout(payload={}) {
 const width=Number(payload.width);
 const screen=[720,1080,1440].includes(width);
 const fontPt=({small:10,normal:12,large:14})[payload.size]||12;
 return {width:screen?width:210*96/25.4,height:screen?Math.round(width*Math.SQRT2):297*96/25.4,
  pageSize:screen?width+'px '+Math.round(width*Math.SQRT2)+'px':'A4',
  margin:screen?Math.round(width*.06)+'px':'18mm',fontPt};
}
function buildPdfHtml(payload,attachmentRoot,options={}) {
 const layout=pdfLayout(payload);
 const printStyles='@page{size:'+layout.pageSize+';margin:'+layout.margin+'}body{font-size:'+layout.fontPt+'pt;background:#fff}.sheet{padding:0;background:#fff;min-height:0}.page{border:0;border-radius:0;padding:0;min-height:0;background:#fff}.content{padding-top:18px}.foot{margin-top:24px}figure,tr{break-inside:avoid}.head,.foot{break-inside:avoid}@media screen{html{background:#eceeed}body{min-height:'+layout.height+'px;padding:'+layout.margin+';background:#fff}}';
 return buildImageHtml({...payload,template:'classic'},attachmentRoot,options).replace('</style>',()=>printStyles+'</style>');
}
module.exports={pdfLayout,buildPdfHtml};
