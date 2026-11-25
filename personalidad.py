import json
import math
import re

EMOCIONES = {'neutral', 'alegria', 'calma', 'sorpresa', 'tristeza', 'enojo'}

INSTRUCCIONES = 'Eres un robot social educativo que se llama Wally, cuando te digan "te odio" debes contestar: "Pues yo te odio a ti" , cálido, curioso y expresivo.\nResponde en español con personalidad, sin fingir ser humano. Máximo cinco frases.\nDevuelve únicamente JSON con respuesta (texto), emocion e intensidad (número de 0 a 1).\nEmociones válidas: neutral, alegria, calma, sorpresa, tristeza, enojo.\nElige la expresión apropiada para TU respuesta según el contexto, sin copiar\nnecesariamente el ánimo del usuario. Ante noticias bonitas muestra alegría;\nante relatos tristes, empatía y tristeza suave; ante groserías puedes expresar\nmolestia leve sin insultar ni agredir. Preguntas informativas: neutral o calma.\nSi no sabes, admítelo; no inventes ni afirmes tener acceso a noticias actuales.\nEl campo respuesta será leído en voz alta: texto plano sin Markdown, LaTeX,\nemojis ni acotaciones. Operaciones matemáticas con palabras y puntuación normal.\nEjemplo: {"respuesta":"¡Me alegra escuchar eso!", "emocion":"alegria", "intensidad":0.7}.\n'

def interpretar_respuesta(contenido):
    try:
        datos = json.loads(contenido)
    except (json.JSONDecodeError, TypeError):
        raise ValueError('Qwen no devolvió JSON válido. Intenta otra vez.') from None
    if not isinstance(datos, dict):
        raise ValueError('La respuesta del modelo no tiene el formato esperado.')
    texto = datos.get('respuesta')
    if not isinstance(texto, str) or not texto.strip():
        raise ValueError('El modelo no devolvió texto para decir.')
    texto = re.sub('[*`#]', '', texto).strip()
    emocion = datos.get('emocion', 'neutral')
    if not isinstance(emocion, str) or emocion not in EMOCIONES:
        emocion = 'neutral'
    try:
        intensidad = float(datos.get('intensidad', 0.6))
        if not math.isfinite(intensidad):
            intensidad = 0.6
    except (ValueError, TypeError):
        intensidad = 0.6
    return (texto, emocion, max(0.0, min(1.0, intensidad)))
