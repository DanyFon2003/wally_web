export const limitar = (x,a=-1,b=1) => Math.max(a,Math.min(b,x));
export function seleccionarRostro(cajas, anterior, ancho, alto, ahora) {
  if (anterior && ahora-anterior.t>800) anterior=null;
  if (!cajas.length) return null;
  if (!anterior) return cajas.reduce((a,b)=>a.width*a.height>=b.width*b.height?a:b);
  const distancia=b=>Math.hypot((b.originX+b.width/2-anterior.x)/ancho,(b.originY+b.height/2-anterior.y)/alto);
  return cajas.filter(b=>distancia(b)<.22).sort((a,b)=>distancia(a)-distancia(b))[0]||null;
}
export class Cara {
  constructor(datos) {
    this.emociones=datos.EMOCIONES;this.pensando=datos.PENSANDO;
    this.actual={...this.emociones.neutral};this.origen={...this.actual};this.destino={...this.actual};
    this.inicio=0;this.estado='reposo';this.mirada=[0,0];this.objetivo=[0,0];this.rostro=null;
    this.ultimoRostro=-Infinity;this.siguienteMirada=0;this.parpadeo=null;this.siguienteParpadeo=performance.now()+3000;
    this.invertir=false;this.nivelBoca=0;this.energia=()=>0;
    this.svg=document.querySelector('#cara');this.ultimo=performance.now();
    this.tick=this.tick.bind(this);requestAnimationFrame(this.tick);
  }
  expresion(nombre='neutral', intensidad=1) {
    const base=this.emociones.neutral, objetivo=nombre==='pensando'?this.pensando:(this.emociones[nombre]||base);
    this.origen={...this.actual};this.destino={};
    for(const k of Object.keys(base)) this.destino[k]=base[k]+(objetivo[k]-base[k])*limitar(intensidad,0,1);
    this.inicio=performance.now();
  }
  cambiarEstado(estado,emocion='neutral',intensidad=1) {
    this.estado=estado;this.expresion(estado==='pensando'?'pensando':emocion,intensidad);
    if(estado==='pensando')this.objetivo=[.7,-1];
  }
  detectar(x,y,t=performance.now()) {this.rostro=[x,y];this.ultimoRostro=t;}
  tick(ahora) {
    const dt=Math.min((ahora-this.ultimo)/1000,.1);this.ultimo=ahora;
    const t=limitar((ahora-this.inicio)/650,0,1),suave=t*t*(3-2*t);
    for(const k of Object.keys(this.actual))this.actual[k]=this.origen[k]+(this.destino[k]-this.origen[k])*suave;
    if(this.estado!=='pensando') {
      const perdido=ahora-this.ultimoRostro;
      if(this.rostro&&perdido<800)this.objetivo=[limitar(this.rostro[0]*1.7*(this.invertir?-1:1)),limitar(this.rostro[1]*1.7)];
      else if(perdido<3000||this.estado!=='reposo')this.objetivo=[0,0];
      else if(ahora>this.siguienteMirada){this.objetivo=Math.random()<.35?[0,0]:[(Math.random()*2-1)*.8,(Math.random()*2-1)*.5];this.siguienteMirada=ahora+2000+Math.random()*3000;}
    }
    const suavizado=1-Math.exp(-12*dt);
    this.mirada=this.mirada.map((v,i)=>v+(this.objetivo[i]-v)*suavizado);
    if(this.parpadeo===null&&ahora>=this.siguienteParpadeo)this.parpadeo=ahora;
    let apertura=1;
    if(this.parpadeo!==null){const p=(ahora-this.parpadeo)/240;if(p>=1){this.parpadeo=null;this.siguienteParpadeo=ahora+2500+Math.random()*3000;}else apertura=1-.94*Math.sin(Math.PI*p)**2;}
    this.nivelBoca+=( (this.estado==='hablando'?this.energia():0)-this.nivelBoca)*(1-Math.exp(-35*dt));
    this.dibujar(ahora,apertura);requestAnimationFrame(this.tick);
  }
  dibujar(ahora,parpadeo) {
    const v=this.actual,p=v.placer,a=v.activacion,d=v.dominancia;
    this.svg.style.color=`hsl(${p<0?215+a*25:155+p*12} ${65+Math.abs(a)*20}% 72%)`;
    document.querySelector('#respiracion').setAttribute('transform',`translate(0 ${Math.sin(ahora*2*Math.PI/4000)*2.5})`);
    const elevacion=Math.max(0,a)*18+Math.max(0,p)*5;
    const inclinacion=p<0?-p*(d>=0?26:-24):p*5,y=82-elevacion;
    document.querySelector('#ceja-izq').setAttribute('d',`M166 ${y-inclinacion/2} Q199 ${y-9} 232 ${y+inclinacion/2}`);
    document.querySelector('#ceja-der').setAttribute('d',`M368 ${y+inclinacion/2} Q401 ${y-9} 434 ${y-inclinacion/2}`);
    document.querySelector('#mirada').setAttribute('transform',`translate(${this.mirada[0]*20} ${this.mirada[1]*12})`);
    const eyeY=108+(1-v.ojos)*20, alto=116*v.ojos+25, centro=eyeY+alto/2;
    for(const [id,x,cx,angulo] of [['izq',171,210,-d*10],['der',377,390,d*10]]) {
      const ojo=document.querySelector(`#ojo-${id}`);ojo.setAttribute('x',x);ojo.setAttribute('y',eyeY);ojo.setAttribute('width',52+d*8);ojo.setAttribute('height',alto);
      document.querySelector(`#g-ojo-${id}`).setAttribute('transform',`rotate(${angulo} ${cx} 162) translate(0 ${centro}) scale(1 ${parpadeo}) translate(0 ${-centro})`);
    }
    const ab=this.estado==='hablando'?limitar(this.nivelBoca,0,.9):v.apertura_boca;
    const ancho=71-47*ab,my=272+20*ab,curva=v.sonrisa*75*(1-ab),cx=300+v.boca_x;
    const path=`M${cx-ancho} ${my} C${cx-ancho*.55} ${my+curva-ab*45} ${cx+ancho*.55} ${my+curva-ab*45} ${cx+ancho} ${my} C${cx+ancho*.55} ${my+curva+ab*45} ${cx-ancho*.55} ${my+curva+ab*45} ${cx-ancho} ${my} Z`;
    const boca=document.querySelector('#boca');boca.setAttribute('d',path);boca.setAttribute('fill',ab>.01?'currentColor':'none');
    const escala=1-.45*Math.min(1,Math.abs(v.boca_x)/35);
    document.querySelector('#g-boca').setAttribute('transform',`translate(${cx} ${my}) scale(${escala}) translate(${-cx} ${-my})`);
  }
}
