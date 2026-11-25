# Wally web

Versión independiente para navegador, a partir de tus archivos recibidos en web(1).zip. No reemplaza la aplicación PySide6. Conserva las seis expresiones PAD, la cara de pensando con boca plana desplazada, mirada arriba y al lado, parpadeo, transición de 650 ms y movimiento vertical suave. personalidad.py contiene las instrucciones de tu asistente, incluido el nombre Wally y la respuesta especial que agregaste. La voz predeterminada es 7847888919de4e038203de57b6600e75.

## Primero probar en tu Mac

1. Descomprime y deja la carpeta wally_web separada de proyecto_final_integrado.
2. Abre una terminal dentro de wally_web.
3. Si hay otro entorno activo: `deactivate`.
4. Crea uno nuevo: `python3 -m venv .venv`.
5. Activa: `source .venv/bin/activate`.
6. Instala: `python -m pip install -r requirements.txt`.
7. Copia tu .env actual a esta carpeta, junto a app.py. Necesita GROQ_API_KEY y FISH_API_KEY. No compartas ni subas ese archivo. .env.example solo indica los nombres.
8. Ejecuta: `python app.py`.
9. Abre http://localhost:8000 en el navegador del Mac. No abras index.html como archivo.

La interfaz no es Gradio: usa SVG y JavaScript para reproducir exactamente las fórmulas de la cara y para controlar pulsación mantenida, audio y cámara en el celular. Python usa FastAPI para conservar privadas las claves y las consultas a los modelos. No necesita PySide6, OpenCV, sounddevice ni soundfile en el servidor web.

## Uso

Pulsa Comenzar para habilitar el audio. Mantén el botón, espera a que indique Te escucho, habla y suelta para enviar. Si aparece el permiso del micrófono por primera vez y ya soltaste, vuelve a mantener el botón después de aceptarlo. La grabación se cancela al abandonar la página y se limita a 60 segundos. No graba mientras reproduce la voz. Si el navegador bloquea el audio, pulsa Escuchar respuesta. Comprueba el volumen multimedia del iPhone.

El engranaje abre ajustes: seguimiento con cámara frontal, invertir la mirada, subtítulos, historial visible y preguntas escritas. El historial es solo visual, privado de esa pestaña; no se envía como memoria al modelo ni se guarda al recargar. La pantalla principal es la cara con un botón pequeño. La cámara es opcional: la conversación funciona si la rechazas.

La boca sigue la energía del audio reproducido mediante Web Audio; no es sincronización por fonemas. Los ojos y cejas siguen la emoción elegida por Qwen. La cara permanece pensando mientras el servidor transcribe, genera respuesta y obtiene la voz. Si Fish Audio falla, se conserva el texto en Ajustes.

## Cámara

Actívala desde Ajustes. Necesita internet inicialmente para descargar MediaPipe Tasks Vision 0.10.32 y el modelo BlazeFace desde CDN de jsDelivr y Google. Las imágenes se procesan en un Web Worker local, no se suben al servidor ni se guardan. No se identifica a la persona ni se determina quién habla. Se elige el rostro mayor al inicio y luego se asocia por proximidad, con pérdida temporal; puede cambiar si las personas se cruzan. Es un detector distinto del Haar de la aplicación Python porque se ejecuta en el navegador. Sus resultados no serán idénticos.

Si la mirada se mueve al lado contrario, activa Invertir mirada horizontal. Esta preferencia se guarda en el navegador. En escuchando y hablando sigue el rostro; pensando conserva tu gesto especial. Después de perder un rostro vuelve al centro y luego retoma la mirada de reposo. Al cambiar de app se apaga la cámara: vuelve a activarla al regresar. Si el navegador no admite el detector, se informa en Ajustes y la voz continúa disponible.

## Probar en iPhone

Cámara y micrófono requieren HTTPS (o localhost en el MISMO dispositivo). El iPhone NO podrá usar esos permisos simplemente abriendo http://IP-DE-TU-MAC:8000; localhost en el iPhone se refiere al propio teléfono. Primero publica en un alojamiento HTTPS, como Render, o usa un túnel HTTPS confiable que ya tengas configurado. No hace falta pagar un dominio.

Abre el enlace HTTPS en Safari, gira el iPhone horizontalmente y pulsa Comenzar. La orientación no se fuerza: gira físicamente el teléfono y desactiva su bloqueo de orientación. Para ocupar más pantalla, usa Compartir → Agregar a inicio y abre el icono. La API de pantalla completa y el bloqueo de suspensión dependen de la versión del navegador; hay alternativas visibles si no están disponibles. No se garantiza ejecución con pantalla apagada o en segundo plano.

## GitHub y Render

Puedes subir esta carpeta a un repositorio separado o incluirla en el repo actual. Si está dentro de otro repo, no subas .venv ni .env.

En Render, Web Service:
- Root Directory: wally_web si el repo contiene esa carpeta; vacío si app.py está en la raíz.
- Build Command: pip install -r requirements.txt
- Start Command: python app.py
- Instance Type: Free si está disponible en tu cuenta.
- Variables: GROQ_API_KEY y FISH_API_KEY; opcional GROQ_MODEL y FISH_VOICE_ID.
- Health Check Path: /health.

PORT lo configura Render. El programa escucha en 0.0.0.0. La aplicación tiene acceso público sin contraseña, como pediste. Cualquiera con el enlace usa las cuotas de tus claves. Se permite una consulta simultánea y seis inicios de consulta por minuto por proceso para no saturar la demo; no es un sistema antiabuso para grandes audiencias. Los límites se reinician cuando reinicia el servidor. Si aumentas procesos o instancias, esos límites no son globales.

No se publica automáticamente con este ZIP. El alojamiento puede suspenderse tras inactividad. Fish usa explícitamente s2.1-pro-free, sin cambiar a un modelo de pago; su disponibilidad y gratuidad dependen del proveedor. Si deja de estar disponible, el texto sigue funcionando y se muestra un aviso de voz. El código no agrega claves a HTML ni JavaScript. Cambia solo personalidad.py para editar las instrucciones del robot.

## Archivos

- app.py: servidor, transcripción, LLM y voz.
- personalidad.py: instrucciones y validación extraídas de tu asistente.
- static/index.html y style.css: pantalla horizontal y ajustes.
- static/cara.js: geometría, expresiones y animación.
- static/expresiones.json: valores originales de cara.py.
- static/app.js: micrófono, reproducción y cámara.
- static/detector-worker.js: detector facial en el dispositivo.
- requirements.txt: solo dependencias de la web.

Esta entrega no mueve servos ni conecta todavía con ESP32. Las coordenadas normalizadas ya están separadas del dibujo para el siguiente paso. No se hacen consultas web de actualidad. Se conserva el máximo de cinco frases solicitado al modelo, sin cortar mecánicamente las frases.

## Verificación y límites

Las pruebas incluidas comprueban rutas, errores y respuesta con proveedores simulados; no utilizan claves reales ni consumen cuota. También se revisan selección de rostro, estados de interacción y geometría con un entorno simulado de navegador. No se ha podido completar una prueba visual en Safari desde este entorno. El audio real, los permisos y el seguimiento deben probarse en tu iPhone. No se afirma compatibilidad universal sin probar esos dispositivos.

Para ejecutar las pruebas del servidor: instala httpx (`python -m pip install httpx`) y ejecuta `python -m unittest discover -s tests`.
