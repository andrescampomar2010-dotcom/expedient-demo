// pdfjs-dist 6.x exige Node >= 22.13.0 (o >= 24). "22" a secas no basta.
export const MIN=[22,13,0];
export function nodeOk(v=process.versions.node){const [a,b,c]=v.split('.').map(Number);if(a>=24)return true;if(a!==22)return false;return b>MIN[1]||(b===MIN[1]&&c>=MIN[2]);}
export function assertNode(v=process.versions.node){if(!nodeOk(v))throw Error(`NODE_TOO_OLD: se necesita Node 22.13.0 o superior (24 también vale); esta instalación es ${v}`);}
