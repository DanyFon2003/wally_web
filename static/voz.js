// Detección local por energía y silencio. No identifica al hablante.
export class DetectorVoz {
  constructor({pausa=1500,umbral=.018,maximo=60000,preRoll=400}={}) {
    this.pausa=pausa;this.umbral=umbral;this.maximo=maximo;this.preRoll=preRoll;
    this.reiniciar();
  }
  reiniciar(){this.pre=[];this.preMs=0;this.segmentos=[];this.activo=false;this.candidatoMs=0;this.silencio=0;this.duracion=0;this.vozMs=0;}
  configurar({pausa,umbral}){this.pausa=pausa;this.umbral=umbral;}
  procesar(muestras,frecuencia) {
    const ms=muestras.length/frecuencia*1000;
    let suma=0;for(const x of muestras)suma+=x*x;
    const rms=Math.sqrt(suma/Math.max(1,muestras.length));
    // Umbral de salida más bajo para no fragmentar las palabras.
    const hayVoz=rms>this.umbral*(this.activo ? .65 : 1);
    if(!this.activo){
      this.pre.push(muestras);this.preMs+=ms;
      while(this.preMs>this.preRoll&&this.pre.length>1)this.preMs-=this.pre.shift().length/frecuencia*1000;
      this.candidatoMs=hayVoz?this.candidatoMs+ms:0;
      if(this.candidatoMs<100)return {tipo:'espera'};
      this.activo=true;this.segmentos=this.pre;this.duracion=this.preMs;
      this.vozMs=this.candidatoMs;this.pre=[];this.preMs=0;
      return {tipo:'inicio'};
    }
    this.segmentos.push(muestras);this.duracion+=ms;
    if(hayVoz){this.vozMs+=ms;this.silencio=0;}else this.silencio+=ms;
    if(this.silencio>=this.pausa||this.duracion>=this.maximo){
      const valido=this.vozMs>=300,segmentos=this.segmentos;
      this.reiniciar();return {tipo:valido?'fin':'descartado',segmentos:valido?segmentos:[]};
    }
    return {tipo:'voz'};
  }
}
export function crearWav(segmentos,frecuencia){
  if(!Number.isFinite(frecuencia)||frecuencia<=0)throw Error('Frecuencia de audio inválida');
  const total=segmentos.reduce((n,x)=>n+x.length,0);
  const entrada=new Float32Array(total);let offset=0;
  for(const bloque of segmentos){entrada.set(bloque,offset);offset+=bloque.length;}
  // Guardar a 16 kHz para limitar el tamaño y mantener compatibilidad con Whisper.
  const destino=16000, cantidad=Math.floor(total*destino/frecuencia);
  const buffer=new ArrayBuffer(44+cantidad*2),vista=new DataView(buffer);
  function texto(pos,t){for(let i=0;i<t.length;i++)vista.setUint8(pos+i,t.charCodeAt(i));}
  texto(0,'RIFF');vista.setUint32(4,36+cantidad*2,true);texto(8,'WAVE');texto(12,'fmt ');
  vista.setUint32(16,16,true);vista.setUint16(20,1,true);vista.setUint16(22,1,true);
  vista.setUint32(24,destino,true);vista.setUint32(28,destino*2,true);
  vista.setUint16(32,2,true);vista.setUint16(34,16,true);texto(36,'data');vista.setUint32(40,cantidad*2,true);
  for(let i=0;i<cantidad;i++){
    const a=Math.floor(i*frecuencia/destino),b=Math.min(total,Math.max(a+1,Math.floor((i+1)*frecuencia/destino)));
    let suma=0;for(let j=a;j<b;j++)suma+=entrada[j];
    const valor=Math.max(-1,Math.min(1,suma/Math.max(1,b-a)));
    vista.setInt16(44+i*2,Math.round(valor*(valor<0?32768:32767)),true);
  }
  return new Blob([buffer],{type:'audio/wav'});
}
