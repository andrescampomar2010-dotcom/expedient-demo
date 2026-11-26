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
 const r=await fetch('/api/users',{credentials:'same-origin'}).catch(()=>null);
 if(!r||!r.ok)return;
 const d=el('details'),sum=el('summary',{},'Usuarios (administración)');d.append(sum);const list=el('div'),msg=el('p');
 const draw=users=>{list.replaceChildren(...users.map(u=>{const b=el('button',{textContent:'Borrar'});b.onclick=async()=>{if(!confirm('¿Borrar a '+u.name+'?'))return;const x=await fetch('/api/users',{method:'DELETE',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name:u.name})});const j=await x.json();if(x.ok)draw(j.users);else msg.textContent=j.error==='LASTADMIN'?'No se puede borrar el último administrador.':'No se pudo borrar.'};return el('div',{},u.name+' · '+u.role+(u.locked?' · bloqueado':'')+' ',b)}))};
 const name=el('input',{placeholder:'Usuario'}),pw=el('input',{placeholder:'Clave (mínimo 12)',type:'password',autocomplete:'new-password'}),role=el('select');
 for(const x of ['operador','lector','admin'])role.append(el('option',{value:x,textContent:x}));
 const add=el('button',{textContent:'Crear usuario'});add.onclick=async()=>{const x=await fetch('/api/users',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.value,password:pw.value,role:role.value})});const j=await x.json();if(x.ok){draw(j.users);name.value=pw.value='';msg.textContent='Usuario creado.'}else msg.textContent=j.error==='PASSWORDTOOSHORT'?'La clave necesita 12 caracteres o más.':j.error==='USEREXISTS'?'Ese usuario ya existe.':'No se pudo crear.'};
 d.append(list,name,pw,role,add,msg);box.append(d);
 draw((await r.json()).users);
}
