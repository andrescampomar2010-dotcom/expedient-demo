// Consume only a Graph-supplied URL. Never send bearer credentials to file hosts.
export async function readDriveText(meta,transport=globalThis.fetch){
 if(!meta?.file||!meta.name?.toLowerCase().endsWith('.txt')||!Number.isFinite(meta.size)||meta.size>200000||meta.size<0)throw Error('ONLY_SMALL_TEXT_FILES');
 const u=new URL(meta['@microsoft.graph.downloadUrl']);const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.port||!(h.endsWith('.sharepoint.com')||h.endsWith('.1drv.com')||h==='api.onedrive.com'||h.endsWith('.files.live.com')))throw Error('DOWNLOAD_HOST_NOT_ALLOWED');
 const r=await transport(u.href,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('DOWNLOAD_FAILED');if(Number(r.headers.get('content-length'))>200000)throw Error('FILE_TOO_LARGE');
 const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>200000)throw Error('FILE_TOO_LARGE');chunks.push(chunk);}const bytes=Buffer.concat(chunks);const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))throw Error('NOT_PLAIN_TEXT');return {id:meta.id,name:meta.name,text,modified:meta.lastModifiedDateTime,source:'Microsoft Graph OneDrive TXT',retrieved:new Date().toISOString()};
}
