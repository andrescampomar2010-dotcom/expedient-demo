// Hilo de prueba que pide memoria sin parar: el tope de memoria debe cortarlo.
const a=[];while(true)a.push(new Array(1e6).fill(Math.random()));
