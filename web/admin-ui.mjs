// Avisos del servidor y gestión de usuarios (solo administradores). Todo se pinta con textContent: nada de HTML de datos.
const el=(t,props={},...kids)=>{const e=document.createElement(t);Object.assign(e,props);for(const k of kids)e.append(k);return e};
export async function mountAdmin(){
 if(document.getElementById('admin-panel'))return;
 const box=el('div',{id:'admin-panel'});box.style.cssText='margin:8px;font-size:14px';
 document.body.prepend(box);
 try{
  const st=await(await fetch('/api/status',{credentials:'same-origin'})).json();
  if(st.receiver?.alert){const a=el('div',{role:'alert'},el('strong',{},'La lectura de correo está parada: '),String(st.receiver.state||''),' · ',String(st.receiver.action||''));a.style.cssText='background:#fde8e1;border:1px solid #c0502d;padding:10px;border-radius:8px;margin-bottom:8px';box.append(a)}
 }catch{}
 const post=async(url,body,method='POST')=>{const x=await fetch(url,{method,credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{ok:x.ok,j:await x.json().catch(()=>({}))}};
 if(document.cookie!==null){const dm=el('details',{},el('summary',{},'Cambiar mi clave')),cur=el('input',{type:'password',placeholder:'Clave actual',autocomplete:'current-password'}),nw=el('input',{type:'password',placeholder:'Clave nueva (mínimo 12)',autocomplete:'new-password'}),mm=el('p'),bt=el('button',{textContent:'Cambiar clave'});
  bt.onclick=async()=>{const r=await post('/api/me/password',{current:cur.value,next:nw.value});cur.value=nw.value='';mm.textContent=r.ok?'Clave cambiada. Se cerraron tus otras sesiones.':r.j.error==='WRONGPASSWORD'?'La clave actual no es correcta.':r.j.error==='PASSWORDTOOSHORT'?'La clave nueva necesita 12 caracteres o más.':'No se pudo cambiar la clave.'};
  dm.append(cur,nw,bt,mm);box.append(dm)}
 const r=await fetch('/api/users',{credentials:'same-origin'}).catch(()=>null);
 if(!r||!r.ok)return;
 const d=el('details'),sum=el('summary',{},'Usuarios (administración)');d.append(sum);const list=el('div'),msg=el('p');
 const draw=users=>{list.replaceChildren(...users.map(u=>{const b=el('button',{textContent:'Borrar'});b.onclick=async()=>{if(!confirm('¿Borrar a '+u.name+'?'))return;const x=await fetch('/api/users',{method:'DELETE',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name:u.name})});const j=await x.json();if(x.ok)draw(j.users);else msg.textContent=j.error==='LASTADMIN'?'No se puede borrar el último administrador.':'No se pudo borrar.'};const rs=el('select');for(const x of ['operador','lector','admin']){const o=el('option',{value:x,textContent:x});if(x===u.role)o.selected=true;rs.append(o)}
   rs.onchange=async()=>{const q=await post('/api/users',{action:'role',name:u.name,role:rs.value});if(q.ok){draw(q.j.users);msg.textContent='Rol cambiado; sus sesiones se cerraron.'}else{msg.textContent=q.j.error==='LASTADMIN'?'No se puede quitar el rol al último administrador.':'No se pudo cambiar el rol.';rs.value=u.role}};
   const rb=el('button',{textContent:'Restablecer clave'});rb.onclick=async()=>{const np=prompt('Clave nueva para '+u.name+' (mínimo 12 caracteres)');if(!np)return;const q=await post('/api/users',{action:'reset',name:u.name,password:np});msg.textContent=q.ok?'Clave restablecida; sus sesiones se cerraron.':'No se pudo restablecer (mínimo 12 caracteres).'};
   return el('div',{},u.name+(u.locked?' (bloqueado) ':' '),rs,' ',rb,' ',b)}))};
 const name=el('input',{placeholder:'Usuario'}),pw=el('input',{placeholder:'Clave (mínimo 12)',type:'password',autocomplete:'new-password'}),role=el('select');
 for(const x of ['operador','lector','admin'])role.append(el('option',{value:x,textContent:x}));
 const add=el('button',{textContent:'Crear usuario'});add.onclick=async()=>{const x=await fetch('/api/users',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.value,password:pw.value,role:role.value})});const j=await x.json();if(x.ok){draw(j.users);name.value=pw.value='';msg.textContent='Usuario creado.'}else msg.textContent=j.error==='PASSWORDTOOSHORT'?'La clave necesita 12 caracteres o más.':j.error==='USEREXISTS'?'Ese usuario ya existe.':'No se pudo crear.'};
 d.append(list,name,pw,role,add,msg);box.append(d);
 draw((await r.json()).users);
}
