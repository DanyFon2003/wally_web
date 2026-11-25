class EntradaAudio extends AudioWorkletProcessor {
  constructor(){super();this.tamano=Math.round(sampleRate*.02);this.bloque=new Float32Array(this.tamano);this.pos=0;}
  process(inputs){
    const canales=inputs[0];if(!canales?.length)return true;
    for(let i=0;i<canales[0].length;i++){
      let valor=0;for(const canal of canales)valor+=canal[i]||0;
      this.bloque[this.pos++]=valor/canales.length;
      if(this.pos===this.tamano){this.port.postMessage(this.bloque,[this.bloque.buffer]);this.bloque=new Float32Array(this.tamano);this.pos=0;}
    }
    return true;
  }
}
registerProcessor('wally-entrada',EntradaAudio);
