import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
class Elemento {
 constructor(id){this.id=id;this.hidden=['ajustes','reproducir','respuesta'].includes(id);this.disabled=id==='hablar';this.textContent='';this.value='';this.checked=false;this.tagName='DIV';this.children=[];this.listeners={};this.attrs={};this.style={};this.classList={toggle(){}};}
 addEventListener(e,f){(this.listeners[e]??=[]).push(f);}
 setAttribute(k,v){this.attrs[k]=v;}
 setPointerCapture(){}
 append(n){this.children.push(n);}
 async emitir(nombre,e={}){for(const fn of this.listeners[nombre]||[])await fn({button:0,pointerId:1,preventDefault(){},...e});}
}
const elementos=new Map();const el=id=>{if(!elementos.has(id))elementos.set(id,new Elemento(id));return elementos.get(id);};
globalThis.document={querySelector:s=>el(s.slice(1)),createElement:()=>new Elemento('p'),activeElement:{tagName:'BODY'},hidden:false,addEventListener(){},documentElement:{}};
globalThis.localStorage={getItem:()=>null,setItem(){}};
globalThis.requestAnimationFrame=()=>0;
let requests=0,stops=0;
const expresiones=JSON.parse(await fs.readFile(new URL('../static/expresiones.json',import.meta.url)));
globalThis.fetch=async(url,opts)=>{
 if(url.endsWith('expresiones.json'))return {json:async()=>expresiones};
 requests++;return {ok:true,json:async()=>({pregunta:'Hola',respuesta:'Hola, soy Wally.',emocion:'alegria',intensidad:.7,audio:btoa('mp3-falso')})};
};
class AudioFalso{
 constructor(){this.state='running';this.destination={};}
 async resume(){this.state='running';}
 createAnalyser(){return {fftSize:512,connect(){},getFloatTimeDomainData(a){a.fill(.08);}};}
 createBufferSource(){return {connect(){},disconnect(){},start(){setTimeout(()=>this.onended?.(),20);},stop(){}};}
 async decodeAudioData(){return {};}
}
globalThis.window={AudioContext:AudioFalso,isSecureContext:true,addEventListener(){}};
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops++}]})}},configurable:true});
class Grabador {
 static isTypeSupported(){return true;}
 constructor(stream,opciones){this.state='inactive';}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable({data:new Blob(['x'.repeat(200)])});setTimeout(()=>this.onstop(),0);}
}
globalThis.MediaRecorder=Grabador;window.MediaRecorder=Grabador;
await import('../static/app.js');
await el('iniciar').onclick();assert.equal(el('bienvenida').hidden,true);assert.equal(el('hablar').disabled,false);
await el('hablar').emitir('pointerdown');await new Promise(r=>setTimeout(r,350));
assert.equal(el('estado').textContent,'Te escucho · suelta para enviar');
assert.equal(el('hablar').disabled,false,'Debe aceptar soltar durante la grabación');
await el('hablar').emitir('pointerup');await new Promise(r=>setTimeout(r,100));
assert.equal(requests,1);assert.equal(stops,1);assert.equal(el('hablar').disabled,false);assert.equal(el('estado').textContent,'Listo para conversar');
assert.equal(el('respuesta').textContent,'Hola, soy Wally.');
const {Cara,seleccionarRostro}=await import('../static/cara.js');
const cara=new Cara(expresiones);cara.cambiarEstado('pensando');cara.tick(performance.now()+700);
assert.equal(cara.destino.apertura_boca,0);assert.deepEqual(cara.objetivo,[.7,-1]);
const b=el('boca').attrs.d;assert(!b.includes('NaN'));assert.equal(cara.actual.boca_x,35);
const cajas=[{originX:10,originY:10,width:100,height:100},{originX:400,originY:10,width:70,height:70}];
assert.equal(seleccionarRostro(cajas,null,640,480,10),cajas[0]);
assert.equal(seleccionarRostro(cajas,{x:60,y:60,t:0},640,480,10),cajas[0]);
assert.equal(seleccionarRostro([cajas[1]],{x:60,y:60,t:0},640,480,10),null);
console.log('Frontend simulado: pulsar/soltar, envío, audio, recuperación y pensando correctos.');
