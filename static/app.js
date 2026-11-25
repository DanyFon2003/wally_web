import {Cara,seleccionarRostro} from './cara.js';
import {DetectorVoz,crearWav} from './voz.js';
const $=s=>document.querySelector(s);
const datos=await fetch('/static/expresiones.json').then(r=>r.json());
const cara=new Cara(datos);
let contexto=null,analizador=null,muestras=null,fuente=null,pendiente=null;
let mic=null,entrada=null,capturador=null,gananciaSilenciosa=null,moduloAudio=null;
let escuchaDeseada=false,preparando=false,ocupado=false,sesionMicro=0,temporizadorReanudar=null;
const detector=new DetectorVoz();
let camara=null,worker=null,camaraEncendiendo=false,camaraSesion=0,intervalo=null,enVuelo=false,anterior=null,ultimoFrame=-1;
let wakeLock=null;
const boton=$('#hablar');
const iconoMicro=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>`;
const iconoMute=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18M9 5a3 3 0 0 1 6 0v5M9 9v2a3 3 0 0 0 5 2M5 10v2a7 7 0 0 0 11.5 5.3M19 10v2a7 7 0 0 1-.5 2.6M12 19v3M8 22h8"/></svg>`;
function estado(texto){$('#estado').textContent=texto;}
function aviso(texto){estado(texto);console.info(texto);}
function actualizarBoton(){
  const pausado=escuchaDeseada&&(ocupado||!!pendiente||!mic);
  const texto=escuchaDeseada?(pausado?'Silenciar micrófono (escucha en pausa)':'Silenciar micrófono'):'Activar micrófono';
  boton.disabled=!$('#bienvenida').hidden;
  boton.innerHTML=escuchaDeseada?iconoMicro:iconoMute;
  boton.setAttribute('aria-label',texto);boton.setAttribute('title',texto);
  boton.setAttribute('aria-pressed',String(escuchaDeseada));
  boton.classList.toggle('activo',escuchaDeseada);
  boton.classList.toggle('pausado',pausado);
  boton.classList.toggle('grabando',escuchaDeseada&&!!mic&&detector.activo);
}
function suspenderMicro(){
  sesionMicro++;clearTimeout(temporizadorReanudar);preparando=false;
  if(capturador){capturador.port.onmessage=null;capturador.disconnect();capturador=null;}
  entrada?.disconnect();entrada=null;gananciaSilenciosa?.disconnect();gananciaSilenciosa=null;
  mic?.getTracks().forEach(t=>t.stop());mic=null;detector.reiniciar();actualizarBoton();
}
function silenciar(mensaje='Micrófono silenciado'){
  escuchaDeseada=false;suspenderMicro();
  if(!ocupado&&!fuente){cara.cambiarEstado('reposo');estado(mensaje);}
}
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
function programarEscucha(){
  clearTimeout(temporizadorReanudar);
  if(escuchaDeseada&&!ocupado&&!pendiente&&!document.hidden){
    // Dar tiempo a que desaparezca el sonido de la bocina antes de escuchar.
    temporizadorReanudar=setTimeout(()=>iniciarEscucha(),700);
  }
}
function reposo(reanudar=true){ocupado=false;cara.cambiarEstado('reposo');actualizarBoton();if(reanudar)programarEscucha();}
function detenerVoz(){if(fuente){fuente.onended=null;try{fuente.stop();}catch{}fuente.disconnect();fuente=null;}}
function agregar(autor,texto){const p=document.createElement('p');p.textContent=`${autor}: ${texto}`;$('#historial').append(p);while($('#historial').children.length>30)$('#historial').firstElementChild.remove();}
async function reproducir(buffer,emocion,intensidad){
  suspenderMicro();await desbloquearAudio();detenerVoz();
  const audio=await contexto.decodeAudioData(buffer.slice(0));
  if(contexto.state!=='running'||document.hidden)throw Error('Audio suspendido');
  fuente=contexto.createBufferSource();fuente.buffer=audio;fuente.connect(analizador);
  fuente.onended=()=>{fuente?.disconnect();fuente=null;pendiente=null;reposo();estado(escuchaDeseada?'Preparando escucha…':'Micrófono silenciado');};
  cara.cambiarEstado('hablando',emocion,intensidad);estado('Hablando · escucha en pausa');fuente.start();
}
async function enviar(form){
  ocupado=true;suspenderMicro();actualizarBoton();$('#enviar').disabled=true;cara.cambiarEstado('pensando');estado('Pensando…');$('#reproducir').hidden=true;pendiente=null;
  const abort=new AbortController(),temporizador=setTimeout(()=>abort.abort(),240000);
  try{
    const r=await fetch('/api/responder',{method:'POST',body:form,signal:abort.signal});
    const data=await r.json();if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'No se pudo procesar la pregunta.');
    agregar('Tú',data.pregunta);agregar('Wally',data.respuesta);$('#respuesta').textContent=data.respuesta;
    $('#respuesta').hidden=!$('#subtitulos').checked;
    if(!data.audio){escuchaDeseada=false;reposo(false);aviso(data.aviso||'No se pudo generar la voz. La respuesta está en Ajustes.');return;}
    const bin=atob(data.audio),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    pendiente={buffer:bytes.buffer,emocion:data.emocion,intensidad:data.intensidad};
    try{if(document.hidden)throw Error('Página oculta');await reproducir(pendiente.buffer,pendiente.emocion,pendiente.intensidad);}
    catch(e){reposo(false);$('#reproducir').hidden=false;aviso('Pulsa Escuchar respuesta para activar el audio.');}
  }catch(e){escuchaDeseada=false;suspenderMicro();reposo(false);aviso(e.name==='AbortError'?'La respuesta tardó demasiado. Activa el micrófono para intentar de nuevo.':e.message);}
  finally{clearTimeout(temporizador);$('#enviar').disabled=false;actualizarBoton();}
}
async function iniciarEscucha(){
  if(!escuchaDeseada||ocupado||pendiente||preparando||mic||document.hidden||!$('#bienvenida').hidden)return;
  const sesion=++sesionMicro;preparando=true;actualizarBoton();estado('Activando micrófono…');
  let flujo=null;
  try{
    if(!navigator.mediaDevices)throw Error('El micrófono necesita HTTPS o localhost.');
    await desbloquearAudio();
    if(!contexto.audioWorklet||!window.AudioWorkletNode)throw Error('Actualiza Safari: se necesita AudioWorklet para la escucha automática.');
    if(!moduloAudio)moduloAudio=contexto.audioWorklet.addModule('/static/entrada-audio.js?v=mic-auto-1').catch(e=>{moduloAudio=null;throw e;});
    await moduloAudio;
    if(sesion!==sesionMicro||!escuchaDeseada||ocupado||document.hidden)return;
    flujo=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    if(sesion!==sesionMicro||!escuchaDeseada||ocupado||document.hidden){flujo.getTracks().forEach(t=>t.stop());return;}
    mic=flujo;detector.reiniciar();
    entrada=contexto.createMediaStreamSource(mic);
    capturador=new AudioWorkletNode(contexto,'wally-entrada');
    gananciaSilenciosa=contexto.createGain();gananciaSilenciosa.gain.value=0;
    entrada.connect(capturador);capturador.connect(gananciaSilenciosa);gananciaSilenciosa.connect(contexto.destination);
    capturador.port.onmessage=({data})=>{
      if(sesion!==sesionMicro||!escuchaDeseada||ocupado||pendiente||document.hidden)return;
      const resultado=detector.procesar(data,contexto.sampleRate);
      if(resultado.tipo==='inicio'){estado('Te escucho…');actualizarBoton();}
      if(resultado.tipo==='descartado'){estado('Escuchando · habla cuando quieras');actualizarBoton();}
      if(resultado.tipo==='fin'){
        const wav=crearWav(resultado.segmentos,contexto.sampleRate);
        const f=new FormData();f.append('audio',wav,'pregunta.wav');enviar(f);
      }
    };
    const pista=mic.getAudioTracks()[0];
    if(pista)pista.onended=()=>{if(sesion===sesionMicro){silenciar();aviso('Se perdió el micrófono. Pulsa el botón para activarlo.');}};
    cara.cambiarEstado('escuchando');estado('Escuchando · habla cuando quieras');
  }catch(e){
    flujo?.getTracks().forEach(t=>t.stop());
    if(sesion===sesionMicro){escuchaDeseada=false;suspenderMicro();reposo(false);aviso(e.name==='NotAllowedError'?'Permite el micrófono desde los ajustes del sitio.':e.message);}
  }finally{if(sesion===sesionMicro)preparando=false;actualizarBoton();}
}
async function alternarMicro(){
  if(!$('#bienvenida').hidden)return;
  if(escuchaDeseada){silenciar();return;}
  escuchaDeseada=true;actualizarBoton();
  if(ocupado||pendiente){estado(pendiente&&!fuente?'Pulsa Escuchar respuesta; después volveré a escuchar.':'Escucha activada · en pausa hasta terminar la respuesta');return;}
  await iniciarEscucha();
}
boton.addEventListener('click',alternarMicro);
window.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!['INPUT','TEXTAREA','BUTTON','SELECT'].includes(document.activeElement.tagName)&&$('#ajustes').hidden){e.preventDefault();if(!e.repeat)alternarMicro();}
});
$('#pausa').onchange=e=>{detector.configurar({pausa:Number(e.target.value),umbral:Number($('#sensibilidad').value)});};
$('#sensibilidad').onchange=e=>{detector.configurar({pausa:Number($('#pausa').value),umbral:Number(e.target.value)});};
$('#reproducir').onclick=async()=>{if(!pendiente)return;try{ocupado=true;actualizarBoton();await reproducir(pendiente.buffer,pendiente.emocion,pendiente.intensidad);$('#reproducir').hidden=true;}catch{reposo(false);aviso('No se pudo reproducir. Comprueba el volumen y vuelve a pulsar.');}};
$('#form-texto').onsubmit=async e=>{e.preventDefault();if(ocupado||preparando||pendiente)return;const texto=$('#texto').value.trim();if(!texto)return;try{await desbloquearAudio();}catch{}$('#texto').value='';$('#ajustes').hidden=true;const f=new FormData();f.append('texto',texto);enviar(f);};
$('#ajustes-btn').onclick=()=>{$('#ajustes').hidden=false;$('#ajustes-btn').setAttribute('aria-expanded','true');};
$('#cerrar-ajustes').onclick=()=>{$('#ajustes').hidden=true;$('#ajustes-btn').setAttribute('aria-expanded','false');};
$('#invertir').onchange=e=>{cara.invertir=e.target.checked;try{localStorage.setItem('wally-invertir',e.target.checked?'1':'0');}catch{}};
try{$('#invertir').checked=localStorage.getItem('wally-invertir')==='1';cara.invertir=$('#invertir').checked;}catch{}
$('#subtitulos').onchange=e=>{$('#respuesta').hidden=!e.target.checked||!$('#respuesta').textContent;};
$('#pantalla').onclick=async()=>{try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else aviso('En iPhone: Compartir → Agregar a inicio para usar toda la pantalla.');}catch{aviso('Usa Agregar a inicio en Safari para ampliar la pantalla.');}};
async function mantenerPantalla(){try{if(navigator.wakeLock)wakeLock=await navigator.wakeLock.request('screen');}catch{}}
$('#iniciar').onclick=async()=>{try{await desbloquearAudio();$('#bienvenida').hidden=true;actualizarBoton();estado('Pulsa el micrófono para activar la escucha');mantenerPantalla();}catch(e){aviso(e.message);}};
actualizarBoton();
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
  if(document.hidden){
    silenciar('Micrófono silenciado al salir de la página');
    if(fuente){detenerVoz();reposo(false);$('#reproducir').hidden=!pendiente;estado('Audio pausado. Pulsa Escuchar respuesta para reiniciarlo.');}
    pararCamara();
  }else mantenerPantalla();
});
window.addEventListener('pagehide',()=>{silenciar();pararCamara();detenerVoz();});
