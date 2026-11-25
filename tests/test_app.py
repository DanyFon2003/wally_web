import base64
import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import app as modulo
from personalidad import interpretar_respuesta

class ClienteFalso:
    def __init__(self, **kw):
        self.chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **kw:SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({
                'respuesta':'La raíz cuadrada de sesenta y cuatro es ocho.',
                'emocion':'calma','intensidad':.5})))])))
        self.audio=SimpleNamespace(transcriptions=SimpleNamespace(create=lambda **kw:SimpleNamespace(text='Pregunta de voz')))
    def __enter__(self):return self
    def __exit__(self,*a):pass
class VozFalsa:
    ok=True
    def __enter__(self):return self
    def __exit__(self,*a):pass
    def iter_content(self,*a):yield b'audio-simulado'

class Pruebas(unittest.TestCase):
    def setUp(self):
        modulo.solicitudes.clear()
        self.client=TestClient(modulo.app)
    def test_archivos_y_claves(self):
        self.assertEqual(self.client.get('/').status_code,200)
        self.assertEqual(self.client.get('/health').json(),{'status':'ok'})
        self.assertEqual(self.client.get('/.env').status_code,404)
        self.assertEqual(self.client.get('/static/../personalidad.py').status_code,404)
        self.assertEqual(self.client.get('/static/expresiones.json').json()['PENSANDO']['apertura_boca'],0)
    def test_validacion(self):
        self.assertEqual(self.client.post('/api/responder',data={'texto':''}).status_code,422)
        self.assertEqual(self.client.post('/api/responder',data={'texto':'x'*2001}).status_code,413)
        self.assertEqual(self.client.post('/api/responder',files={'audio':('x.txt',b'abc','text/plain')}).status_code,415)
    def test_faltan_claves(self):
        with patch.dict(os.environ,{'GROQ_API_KEY':'','FISH_API_KEY':''}):
            self.assertEqual(self.client.post('/api/responder',data={'texto':'Hola'}).status_code,503)
    def test_texto_y_audio(self):
        with patch.dict(os.environ,{'GROQ_API_KEY':'clave-falsa','FISH_API_KEY':'otra-falsa'}),patch.object(modulo,'Groq',ClienteFalso),patch.object(modulo.requests,'post',return_value=VozFalsa()):
            for args in [dict(data={'texto':'Hola'}),dict(files={'audio':('pregunta.m4a',b'grabacion-simulada','audio/mp4')})]:
                r=self.client.post('/api/responder',**args)
                self.assertEqual(r.status_code,200,r.text)
                d=r.json();self.assertEqual(d['emocion'],'calma');self.assertEqual(base64.b64decode(d['audio']),b'audio-simulado')
                self.assertNotIn('clave-falsa',r.text)
    def test_error_voz_conserva_texto(self):
        with patch.dict(os.environ,{'GROQ_API_KEY':'a','FISH_API_KEY':'b'}),patch.object(modulo,'Groq',ClienteFalso),patch.object(modulo.requests,'post',side_effect=RuntimeError('fallo')):
            r=self.client.post('/api/responder',data={'texto':'Hola'});self.assertEqual(r.status_code,200)
            self.assertTrue(r.json()['respuesta']);self.assertIsNone(r.json()['audio'])
    def test_formato_emocion(self):
        self.assertEqual(interpretar_respuesta('{"respuesta":"Hola","emocion":[],"intensidad":"NaN"}'),('Hola','neutral',.6))

if __name__=='__main__':unittest.main()
