// El análisis de imágenes ocurre en este hilo, sin peticiones de imágenes al servidor.
let detector=null;
self.onmessage=async ({data})=>{
  if(data.tipo==='iniciar') {
    try {
      const version='0.10.32';
      const {FilesetResolver,FaceDetector}=await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/vision_bundle.mjs`);
      const vision=await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`);
      detector=await FaceDetector.createFromOptions(vision,{
        baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',delegate:'CPU'},
        runningMode:'VIDEO',minDetectionConfidence:.6,
      });
      self.postMessage({tipo:'listo'});
    }catch(e){self.postMessage({tipo:'error',mensaje:'No se pudo cargar el detector. Comprueba tu conexión y permite las descargas del modelo.'});}
  }else if(data.tipo==='imagen') {
    try {
      if(!detector)throw Error('Detector no preparado');
      const resultado=detector.detectForVideo(data.imagen,data.t);
      self.postMessage({tipo:'resultado',cajas:resultado.detections.map(d=>d.boundingBox),ancho:data.ancho,alto:data.alto,t:data.t});
    }catch(e){self.postMessage({tipo:'error',mensaje:'El detector no pudo procesar la cámara en este navegador.'});}
    finally{data.imagen.close();}
  }
};
