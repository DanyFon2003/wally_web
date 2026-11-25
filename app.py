"""Servidor de Wally. La cámara y el dibujo viven en el navegador."""
import base64
import io
import logging
import os
import threading
import time
from collections import deque
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from groq import Groq, APIStatusError
from starlette.concurrency import run_in_threadpool

from personalidad import INSTRUCCIONES, interpretar_respuesta

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / '.env')
app = FastAPI(title='Wally', docs_url=None, redoc_url=None)
app.mount('/static', StaticFiles(directory=BASE / 'static'), name='static')
log = logging.getLogger('wally')
limite = threading.BoundedSemaphore(1)
solicitudes = deque()
lock = threading.Lock()
MAX_AUDIO = 10 * 1024 * 1024
FORMATOS = {'audio/webm':'webm', 'audio/mp4':'m4a', 'video/mp4':'mp4',
            'audio/ogg':'ogg', 'audio/wav':'wav', 'audio/x-wav':'wav',
            'audio/mpeg':'mp3'}


@app.middleware('http')
async def cabeceras(request, call_next):
    respuesta = await call_next(request)
    respuesta.headers['X-Content-Type-Options'] = 'nosniff'
    respuesta.headers['Referrer-Policy'] = 'same-origin'
    respuesta.headers['Permissions-Policy'] = 'camera=(self), microphone=(self)'
    if request.url.path.startswith('/api/'):
        respuesta.headers['Cache-Control'] = 'no-store'
    return respuesta


@app.get('/')
def inicio():
    return FileResponse(BASE / 'static' / 'index.html')


@app.get('/health')
def salud():
    return {'status':'ok'}


def procesar(texto, audio=None, extension='m4a'):
    if not os.getenv('GROQ_API_KEY') or not os.getenv('FISH_API_KEY'):
        raise HTTPException(503, 'Falta configurar las claves del servidor.')
    if not limite.acquire(blocking=False):
        raise HTTPException(429, 'Wally está atendiendo otra pregunta. Intenta en un momento.')
    try:
        with lock:
            ahora = time.monotonic()
            while solicitudes and ahora - solicitudes[0] >= 60:
                solicitudes.popleft()
            if len(solicitudes) >= 6:
                raise HTTPException(429, 'Llegamos al límite de esta demo. Espera un minuto.')
            solicitudes.append(ahora)
        with Groq(timeout=60., max_retries=0) as cliente:
            if audio is not None:
                archivo = io.BytesIO(audio)
                archivo.name = f'pregunta.{extension}'
                texto = cliente.audio.transcriptions.create(file=archivo,
                    model='whisper-large-v3-turbo', language='es',
                    response_format='json', temperature=0).text.strip()
            if not texto:
                raise HTTPException(422, 'No reconocí una pregunta. Inténtalo otra vez.')
            r = cliente.chat.completions.create(
                model=os.getenv('GROQ_MODEL', 'qwen/qwen3.8-27b'),
                messages=[{'role':'system','content':INSTRUCCIONES},
                          {'role':'user','content':texto}],
                response_format={'type':'json_object'}, max_completion_tokens=400)
        respuesta, emocion, intensidad = interpretar_respuesta(r.choices[0].message.content)
        salida = dict(pregunta=texto, respuesta=respuesta,
                      emocion=emocion, intensidad=intensidad, audio=None, aviso=None)
        # Conservar el texto aunque falle el proveedor de voz.
        try:
            with requests.post('https://api.fish.audio/v1/tts', headers={
                'Authorization':f"Bearer {os.environ['FISH_API_KEY']}",
                'model':'s2.1-pro-free',
            }, json={'text':respuesta, 'reference_id':os.getenv('FISH_VOICE_ID',
                '7847888919de4e038203de57b6600e75'), 'format':'mp3'},
                timeout=(15,120), stream=True) as voz:
                if not voz.ok:
                    salida['aviso'] = f'La respuesta está lista, pero Fish Audio devolvió {voz.status_code}.'
                else:
                    partes, total = [], 0
                    for bloque in voz.iter_content(65536):
                        total += len(bloque)
                        if total > 12 * 1024 * 1024:
                            raise ValueError('Audio demasiado grande.')
                        partes.append(bloque)
                    contenido = b''.join(partes)
                    if contenido:
                        salida['audio'] = base64.b64encode(contenido).decode('ascii')
                    else:
                        salida['aviso'] = 'El servicio de voz devolvió audio vacío.'
        except Exception:
            salida['aviso'] = 'La respuesta está lista, pero no se pudo generar la voz. Intenta otra pregunta.'
        return salida
    except HTTPException:
        raise
    except APIStatusError as error:
        codigo = getattr(error, 'status_code', 502)
        if codigo == 429:
            raise HTTPException(429, 'Groq alcanzó su límite. Espera un minuto e intenta de nuevo.') from None
        raise HTTPException(502, 'Groq no pudo responder. Revisa las claves y el modelo del servidor.') from None
    except ValueError:
        raise HTTPException(502, 'El modelo no devolvió una respuesta válida. Intenta otra vez.') from None
    except Exception as error:
        # No registrar claves, audio, preguntas ni cuerpos de respuestas.
        log.warning('Fallo de consulta: %s', type(error).__name__)
        raise HTTPException(502, 'No se pudo consultar al asistente. Intenta nuevamente.') from None
    finally:
        limite.release()


@app.post('/api/responder')
async def responder(texto: str = Form(''), audio: UploadFile | None = File(None)):
    texto = texto.strip()
    if len(texto) > 2000:
        raise HTTPException(413, 'La pregunta es demasiado larga.')
    datos, extension = None, 'm4a'
    if audio is not None:
        try:
            tipo = (audio.content_type or '').split(';')[0].lower()
            if tipo not in FORMATOS:
                raise HTTPException(415, 'El formato de grabación no es compatible.')
            extension = FORMATOS[tipo]
            datos = await audio.read(MAX_AUDIO + 1)
            if len(datos) > MAX_AUDIO:
                raise HTTPException(413, 'La grabación es demasiado grande. Habla menos de un minuto.')
            if not datos:
                raise HTTPException(422, 'La grabación está vacía.')
        finally:
            await audio.close()
    elif not texto:
        raise HTTPException(422, 'Escribe o graba una pregunta.')
    return JSONResponse(await run_in_threadpool(procesar, texto, datos, extension))


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=os.getenv('HOST', '0.0.0.0'),
                port=int(os.getenv('PORT', '8000')))
