import test from 'node:test';import assert from 'node:assert/strict';
import {parseCatalog,llmService} from '../server/llm.mjs';

const approved={CHAT_DATA_APPROVED:'true',ANTHROPIC_API_KEY:'k'.repeat(30),OPENAI_API_KEY:'o'.repeat(30),GEMINI_API_KEY:'g'.repeat(30)};

test('catálogo: reglas siempre; proveedores solo con adaptador y modelo válido; duplicados y entradas malas fuera',()=>{
 const c=parseCatalog({...approved,CHAT_MODELS:'anthropic:claude-test-1, openai:gpt-test, gemini:gemini-test, mistral:x, anthropic:claude-test-1, anthropic:, :nope'});
 assert.deepEqual(c.map(m=>m.ref),['sim:reglas','anthropic:claude-test-1','openai:gpt-test','gemini:gemini-test']);
 assert.equal(c[0].simulated,true);assert.equal(c[0].ready,true);
 assert.ok(c.slice(1).every(m=>m.ready));
});
test('sin aprobación de datos o sin clave, el modelo real no está listo',()=>{
 assert.equal(parseCatalog({CHAT_MODELS:'anthropic:claude-test-1',ANTHROPIC_API_KEY:'x'.repeat(30)})[1].ready,false);
 assert.equal(parseCatalog({...approved,CHAT_MODELS:'anthropic:claude-test-1',ANTHROPIC_API_KEY:''})[1].ready,false);
});
test('adaptador anthropic: forma de petición verificada y texto de respuesta',async()=>{
 let sent;const t=async(u,o)=>{sent={u,o};return{ok:true,json:async()=>({model:'claude-test-1',content:[{type:'text',text:'Hola'}]})};};
 const llm=llmService({...approved,CHAT_MODELS:'anthropic:claude-test-1'},t);
 const r=await llm.complete({ref:'anthropic:claude-test-1',system:'sys',messages:[{role:'user',content:'hola'}],maxTokens:500});
 assert.equal(r.text,'Hola');assert.equal(r.model,'claude-test-1');
 assert.equal(sent.u,'https://api.anthropic.com/v1/messages');
 assert.equal(sent.o.headers['x-api-key'],'k'.repeat(30));assert.equal(sent.o.headers['anthropic-version'],'2023-06-01');
 const body=JSON.parse(sent.o.body);assert.equal(body.model,'claude-test-1');assert.equal(body.max_tokens,500);assert.equal(body.system,'sys');assert.deepEqual(body.messages,[{role:'user',content:'hola'}]);
});
test('adaptador openai-compatible: endpoint configurable, Bearer, messages con system primero',async()=>{
 let sent;const t=async(u,o)=>{sent={u,o};return{ok:true,json:async()=>({model:'gpt-test',choices:[{message:{content:'Respuesta'}}]})};};
 const llm=llmService({...approved,CHAT_MODELS:'openai:gpt-test'},t);
 const r=await llm.complete({ref:'openai:gpt-test',system:'sys',messages:[{role:'user',content:'q'}],maxTokens:500});
 assert.equal(r.text,'Respuesta');
 assert.equal(sent.u,'https://api.openai.com/v1/chat/completions');
 assert.equal(sent.o.headers.authorization,'Bearer '+'o'.repeat(30));
 const body=JSON.parse(sent.o.body);assert.equal(body.messages[0].role,'system');assert.equal(body.messages[1].content,'q');assert.equal(body.max_tokens,undefined,'sin tope propietario: compatibilidad');
 const local=llmService({...approved,OPENAI_BASE_URL:'http://localhost:11434/v1',CHAT_MODELS:'openai:local-model'},t);
 await local.complete({ref:'openai:local-model',system:'s',messages:[{role:'user',content:'q'}],maxTokens:500});
 assert.equal(sent.u,'http://localhost:11434/v1/chat/completions');
 await assert.rejects(()=>llmService({...approved,OPENAI_BASE_URL:'http://ejemplo-inseguro.test/v1',CHAT_MODELS:'openai:xx'},t).complete({ref:'openai:xx',system:'s',messages:[{role:'user',content:'q'}],maxTokens:500}),/AI_BASE_URL_NOT_HTTPS/);
});
test('adaptador gemini: generateContent con x-goog-api-key, systemInstruction y roles model/user',async()=>{
 let sent;const t=async(u,o)=>{sent={u,o};return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Respuesta gem'}]}}]})};};
 const llm=llmService({...approved,CHAT_MODELS:'gemini:gemini-test'},t);
 const r=await llm.complete({ref:'gemini:gemini-test',system:'sys',messages:[{role:'user',content:'q'},{role:'assistant',content:'a'}],maxTokens:600});
 assert.equal(r.text,'Respuesta gem');
 assert.equal(sent.u,'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
 assert.equal(sent.o.headers['x-goog-api-key'],'g'.repeat(30));
 const body=JSON.parse(sent.o.body);
 assert.deepEqual(body.systemInstruction,{parts:[{text:'sys'}]});
 assert.deepEqual(body.contents,[{role:'user',parts:[{text:'q'}]},{role:'model',parts:[{text:'a'}]}]);
 assert.equal(body.generationConfig.maxOutputTokens,600);
});
test('sin llamada real en tests: simulado nunca llama; no listo, HTTP error y respuesta vacía se rechazan',async()=>{
 let calls=0;const t=async()=>{calls++;return{ok:false};};
 await assert.rejects(()=>llmService({...approved,CHAT_MODELS:'anthropic:claude-test-1'},t).complete({ref:'sim:reglas',system:'s',messages:[{role:'user',content:'q'}]}),/AI_SIMULATED_NO_CALL/);
 assert.equal(calls,0);
 await assert.rejects(()=>llmService({CHAT_MODELS:'anthropic:claude-test-1'},t).complete({ref:'anthropic:claude-test-1',system:'s',messages:[{role:'user',content:'q'}]}),/AI_MODEL_NOT_READY/);
 assert.equal(calls,0);
 await assert.rejects(()=>llmService({...approved,CHAT_MODELS:'anthropic:claude-test-1'},t).complete({ref:'anthropic:claude-test-1',system:'s',messages:[{role:'user',content:'q'}]}),/AI_REQUEST_FAILED/);
 const empty=async()=>({ok:true,json:async()=>({content:[]})});
 await assert.rejects(()=>llmService({...approved,CHAT_MODELS:'anthropic:claude-test-1'},empty).complete({ref:'anthropic:claude-test-1',system:'s',messages:[{role:'user',content:'q'}]}),/AI_EMPTY_RESULT/);
 await assert.rejects(()=>llmService({...approved,CHAT_MODELS:'anthropic:claude-test-1'},t).complete({ref:'nadie:x',system:'s',messages:[{role:'user',content:'q'}]}),/AI_UNKNOWN_MODEL/);
});
