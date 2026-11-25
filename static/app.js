import {Cara,seleccionarRostro} from './cara.js';
const $=s=>document.querySelector(s);
const datos=await fetch('/static/expresiones.json').then(r=>r.json());
const cara=new Cara(datos);
let contexto=null,analizador=null,muestras=null,fuente=null,pendiente=null;
let mic=null,grabador=null,partes=[],presionado=false,preparando=false,ocupado=false,cancelar=false,limite=null,inicioGrabacion=0;
let camara=null,worker=null,camaraEncendiendo=false,camaraSesion=0,intervalo=null,enVuelo=false,anterior=null,ultimoFrame=-1;
let wakeLock=null;
const boton=$('#hablar');
function estado(texto){$('#estado').textContent=texto;}
function aviso(texto){estado(texto);console.info(texto);}
function actualizarBoton(){boton.disabled=ocupado;boton.classList.toggle('grabando',!!grabador&&grabador.state==='recording');boton.textContent=ocupado?'Un momento…':grabador?.state==='recording'?'Suelta para enviar':'Mantén para hablar';}
function liberarMic(){mic?.getTracks().forEach(t=>t.stop());mic=null;}
async function desbloquearAudio(){
  if(!contexto){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Este navegador no admite audio.');contexto=new AC();analizador=contexto.createAnalyser();analizador.fftSize=512;muestras=new Float32Array(analizador.fftSize);analizador.connect(contexto.destination);}
  if(contexto.state!=='running')await contexto.resume();
}
cara.energia=()=>{
  if(!analizador||contexto.state!=='running')return 0;
  analizador.getFloatTimeDomainData(muestras);
  let suma=0;for(const n of muestras)suma+=n*n;
  const rms=Math.sqrt(suma/muestras.length);return rms<.008?0:Math.min(.9,rms*5);
};
function reposo(){ocupado=false;cara.cambiarEstado('reposo');actualizarBoton();}
function detenerVoz(){if(fuente){fuente.onended=null;try{fuente.stop();}catch{}fuente.disconnect();fuente=null;}}
function agregar(autor,texto){const p=document.createElement('p');p.textContent=`${autor}: ${texto}`;$('#historial').append(p);while($('#historial').children.length>30)$('#historial').firstElementChild.remove();}
async function reproducir(buffer,emocion,intensidad){
  await desbloquearAudio();detenerVoz();
  const audio=await contexto.decodeAudioData(buffer.slice(0));
  if(contexto.state!=='running')throw Error('Audio suspendido');
  fuente=contexto.createBufferSource();fuente.buffer=audio;fuente.connect(analizador);
  fuente.onended=()=>{fuente?.disconnect();fuente=null;pendiente=null;reposo();estado('Listo para conversar');};
  cara.cambiarEstado('hablando',emocion,intensidad);estado('Hablando');fuente.start();
}
async function enviar(form){
  ocupado=true;actualizarBoton();$('#enviar').disabled=true;cara.cambiarEstado('pensando');estado('Pensando…');$('#reproducir').hidden=true;pendiente=null;
  const abort=new AbortController(),temporizador=setTimeout(()=>abort.abort(),240000);
  try{
    const r=await fetch('/api/responder',{method:'POST',body:form,signal:abort.signal});
    const data=await r.json();if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'No se pudo procesar la pregunta.');
    agregar('Tú',data.pregunta);agregar('Wally',data.respuesta);$('#respuesta').textContent=data.respuesta;
    $('#respuesta').hidden=!$('#subtitulos').checked;
    if(!data.audio){reposo();aviso(data.aviso||'No se pudo generar la voz. La respuesta está en Ajustes.');return;}
    const bin=atob(data.audio),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    pendiente={buffer:bytes.buffer,emocion:data.emocion,intensidad:data.intensidad};
    try{if(document.hidden)throw Error('Página oculta');await reproducir(pendiente.buffer,pendiente.emocion,pendiente.intensidad);}
    catch(e){reposo();$('#reproducir').hidden=false;aviso('Pulsa Escuchar respuesta para activar el audio.');}
  }catch(e){reposo();aviso(e.name==='AbortError'?'La respuesta tardó demasiado. Intenta otra vez.':e.message);}
  finally{clearTimeout(temporizador);$('#enviar').disabled=false;}
}
async function comenzarGrabacion(){
  if(ocupado||preparando||presionado||!$('#bienvenida').hidden)return;
  presionado=true;preparando=true;cancelar=false;actualizarBoton();estado('Abriendo micrófono…');
  try{
    if(!navigator.mediaDevices||!window.MediaRecorder)throw Error('El micrófono necesita HTTPS o localhost y un navegador compatible.');
    await desbloquearAudio();
    mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    if(!presionado){liberarMic();reposo();estado('Permiso listo. Mantén el botón de nuevo.');return;}
    const tipo=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!tipo)throw Error('No hay un formato de grabación compatible.');
    partes=[];grabador=new MediaRecorder(mic,{mimeType:tipo});inicioGrabacion=performance.now();
    grabador.ondataavailable=e=>{if(e.data.size)partes.push(e.data);};
    grabador.onerror=()=>{cancelar=true;finalizarGrabacion(true);aviso('Falló la grabación. Inténtalo nuevamente.');};
    grabador.onstop=()=>{
      const duracion=performance.now()-inicioGrabacion,blob=new Blob(partes,{type:tipo});
      liberarMic();grabador=null;clearTimeout(limite);
      if(cancelar||duracion<300||blob.size<100){reposo();estado(cancelar?'Grabación cancelada':'Mantén el botón un poco más mientras hablas.');return;}
      const f=new FormData();f.append('audio',blob,tipo.includes('mp4')?'pregunta.m4a':'pregunta.webm');enviar(f);
    };
    grabador.start();cara.cambiarEstado('escuchando');estado('Te escucho · suelta para enviar');
    limite=setTimeout(()=>finalizarGrabacion(),60000);
  }catch(e){liberarMic();presionado=false;reposo();aviso(e.name==='NotAllowedError'?'Permite el micrófono desde los ajustes del sitio.':e.message);}
  finally{preparando=false;actualizarBoton();}
}
function finalizarGrabacion(descartar=false){
  presionado=false;cancelar=descartar;clearTimeout(limite);
  if(grabador?.state==='recording'){ocupado=true;grabador.stop();actualizarBoton();}
}
boton.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();boton.setPointerCapture(e.pointerId);comenzarGrabacion();});
boton.addEventListener('pointerup',()=>finalizarGrabacion());
boton.addEventListener('pointercancel',()=>finalizarGrabacion(true));
boton.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)&&$('#ajustes').hidden){e.preventDefault();if(!e.repeat)comenzarGrabacion();}});
window.addEventListener('keyup',e=>{if(e.code==='Space')finalizarGrabacion();});
boton.addEventListener('keydown',e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();if(!e.repeat)comenzarGrabacion();}});
boton.addEventListener('keyup',e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();finalizarGrabacion();}});
$('#reproducir').onclick=async()=>{if(!pendiente)return;try{ocupado=true;actualizarBoton();await reproducir(pendiente.buffer,pendiente.emocion,pendiente.intensidad);$('#reproducir').hidden=true;}catch{reposo();aviso('No se pudo reproducir. Comprueba el volumen y vuelve a pulsar.');}};
$('#form-texto').onsubmit=async e=>{e.preventDefault();if(ocupado||grabador||preparando)return;const texto=$('#texto').value.trim();if(!texto)return;try{await desbloquearAudio();}catch{}$('#texto').value='';$('#ajustes').hidden=true;const f=new FormData();f.append('texto',texto);enviar(f);};
$('#ajustes-btn').onclick=()=>{$('#ajustes').hidden=false;$('#ajustes-btn').setAttribute('aria-expanded','true');};
$('#cerrar-ajustes').onclick=()=>{$('#ajustes').hidden=true;$('#ajustes-btn').setAttribute('aria-expanded','false');};
$('#invertir').onchange=e=>{cara.invertir=e.target.checked;localStorage.setItem('wally-invertir',e.target.checked?'1':'0');};
try{$('#invertir').checked=localStorage.getItem('wally-invertir')==='1';cara.invertir=$('#invertir').checked;}catch{}
$('#subtitulos').onchange=e=>{$('#respuesta').hidden=!e.target.checked||!$('#respuesta').textContent;};
$('#pantalla').onclick=async()=>{try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else aviso('En iPhone: Compartir → Agregar a inicio para usar toda la pantalla.');}catch{aviso('Usa Agregar a inicio en Safari para ampliar la pantalla.');}};
async function mantenerPantalla(){try{if(navigator.wakeLock)wakeLock=await navigator.wakeLock.request('screen');}catch{}}
$('#iniciar').onclick=async()=>{try{await desbloquearAudio();$('#bienvenida').hidden=true;boton.disabled=false;estado('Listo · mantén el botón para hablar');mantenerPantalla();}catch(e){aviso(e.message);}};

function pararCamara(){
  camaraSesion++;clearInterval(intervalo);intervalo=null;worker?.terminate();worker=null;
  camara?.getTracks().forEach(t=>t.stop());camara=null;$('#video').srcObject=null;
  anterior=null;cara.rostro=null;cara.ultimoRostro=-Infinity;enVuelo=false;camaraEncendiendo=false;
  $('#camara-btn').textContent='Activar seguimiento';$('#camara-estado').textContent='Cámara apagada';
}
async function iniciarCamara(){
  if(camaraEncendiendo)return;
  if(camara){pararCamara();return;}
  const sesion=++camaraSesion;camaraEncendiendo=true;$('#camara-btn').disabled=true;
  $('#camara-estado').textContent='Cargando cámara y detector…';
  try{
    if(!window.isSecureContext||!navigator.mediaDevices)throw Error('La cámara necesita un enlace HTTPS. En tu Mac también funciona localhost.');
    const flujo=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
    if(sesion!==camaraSesion){flujo.getTracks().forEach(t=>t.stop());return;}
    camara=flujo;const video=$('#video');video.srcObject=camara;await video.play();
    worker=new Worker('/static/detector-worker.js');const miWorker=worker;
    await new Promise((resolve,reject)=>{
      const espera=setTimeout(()=>reject(Error('La descarga del detector tardó demasiado. Prueba nuevamente.')),45000);
      miWorker.onerror=()=>{clearTimeout(espera);reject(Error('No se pudo iniciar el detector en este navegador.'));};
      miWorker.onmessage=({data})=>{if(data.tipo==='listo'){clearTimeout(espera);resolve();}else if(data.tipo==='error'){clearTimeout(espera);reject(Error(data.mensaje));}};
      miWorker.postMessage({tipo:'iniciar'});
    });
    if(sesion!==camaraSesion)return;
    ultimoFrame=-1;
    miWorker.onmessage=({data})=>{
      if(sesion!==camaraSesion)return;enVuelo=false;
      if(data.tipo==='error'){pararCamara();$('#camara-estado').textContent=data.mensaje;return;}
      if(data.tipo!=='resultado')return;
      const caja=seleccionarRostro(data.cajas,anterior,data.ancho,data.alto,data.t);
      if(caja){anterior={x:caja.originX+caja.width/2,y:caja.originY+caja.height/2,t:data.t};cara.detectar(anterior.x/data.ancho*2-1,anterior.y/data.alto*2-1);$('#camara-estado').textContent='Siguiendo un rostro';}
      else{$('#camara-estado').textContent='Buscando un rostro';if(anterior&&data.t-anterior.t>800)anterior=null;}
    };
    miWorker.onerror=()=>{pararCamara();$('#camara-estado').textContent='El detector se detuvo. Puedes volver a activarlo.';};
    intervalo=setInterval(async()=>{
      if(enVuelo||video.readyState<2||document.hidden||video.currentTime===ultimoFrame)return;
      enVuelo=true;ultimoFrame=video.currentTime;
      try{const imagen=await createImageBitmap(video);if(sesion!==camaraSesion){imagen.close();return;}miWorker.postMessage({tipo:'imagen',imagen,ancho:imagen.width,alto:imagen.height,t:performance.now()},[imagen]);}
      catch{enVuelo=false;pararCamara();$('#camara-estado').textContent='No se pudo leer la cámara. Vuelve a activar el seguimiento.';}
    },120);
    $('#camara-btn').textContent='Apagar seguimiento';$('#camara-estado').textContent='Buscando un rostro';
  }catch(e){if(sesion===camaraSesion){pararCamara();$('#camara-estado').textContent=e.name==='NotAllowedError'?'Permite la cámara desde los ajustes del sitio.':e.message;}}
  finally{camaraEncendiendo=false;$('#camara-btn').disabled=false;}
}
$('#camara-btn').onclick=iniciarCamara;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(grabador||preparando)finalizarGrabacion(true);if(fuente){detenerVoz();reposo();$('#reproducir').hidden=!pendiente;estado('Audio pausado. Pulsa Escuchar respuesta para reiniciarlo.');}pararCamara();}
  else mantenerPantalla();
});
window.addEventListener('pagehide',()=>{cancelar=true;finalizarGrabacion(true);liberarMic();pararCamara();detenerVoz();});
window.addEventListener('blur',()=>{if(grabador)finalizarGrabacion(true);});
