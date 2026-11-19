# Cena de teste: imprime saída típica (logs com emoji, barra de progresso, linhas que quebram), depois tira uma foto
# da tela do próprio console (o que o ConPTY acha que está na tela) e imprime a foto em base64 entre marcadores.
import base64, ctypes, json, random, sys, time
from ctypes import wintypes

sys.stdout.reconfigure(encoding="utf-8")
_cru = []
_w = sys.stdout.write
def _grava(t):
    _cru.append(t); return _w(t)
sys.stdout.write = _grava
_print = print
def print(*a, **k):
    _grava(" ".join(str(x) for x in a) + k.get("end", "\n"))
    if k.get("flush"): sys.stdout.flush()
semente = int(sys.argv[1]) if len(sys.argv) > 1 else 1
modo = sys.argv[2] if len(sys.argv) > 2 else "tudo"
random.seed(semente)

EMOJIS = {
    "simples": ["🔧", "📊", "🚀", "🎯", "🔄", "📅", "🔍", "📁", "🤖", "✅", "❌", "⭐", "⚡", "✨", "⏳"],
    "fe0f": ["⚙️", "✔️", "ℹ️", "⏱️", "🖥️", "🗂️", "⚠️", "☑️", "✳️", "🛠️"],
    "texto": ["⏺", "→", "✓", "✔", "•", "─", "│", "▶", "◆", "★", "⚙", "ℹ"],
    "juntos": ["👨‍💻", "🇧🇷", "👍🏽", "1️⃣", "é", "ñ", "😶‍🌫️"],
    "cjk": ["日本", "한국", "中文"],
}
grupos = list(EMOJIS) if modo == "tudo" else modo.split(",")
PALAVRAS = "Iniciando processo carregando dados configurando cliente modo paralelo upload arquivo usuários filtrados total encontrados período análise".split()

def linha():
    partes = []
    for _ in range(random.randint(2, 9)):
        if random.random() < 0.35:
            partes.append(random.choice(EMOJIS[random.choice(grupos)]))
        partes.append(random.choice(PALAVRAS))
    s = " ".join(partes)
    if random.random() < 0.2:
        s = "\x1b[3%dm%s\x1b[0m" % (random.randint(1, 6), s)
    return s

def larg(tok):
    # largura como o Claude Code (string-width) conta: emoji = 2 por grafema, CJK = 2 por caractere
    if tok in EMOJIS["texto"] or tok in ("é", "ñ"): return 1
    if tok in EMOJIS["cjk"]: return 2 * len(tok)
    if any(tok in v for k, v in EMOJIS.items() if k != "texto"): return 2
    return len(tok)

esperado = []
if modo.startswith("tui"):
    # como um app de tela (Ink/Claude Code): escreve pedaços e pula para a coluna que ELE calculou (CSI n G)
    grupos = list(EMOJIS)
    for i in range(random.randint(20, 30)):
        toks = []
        for _ in range(random.randint(2, 6)):
            if random.random() < 0.5: toks.append(random.choice(EMOJIS[random.choice(grupos)]))
            toks.append(random.choice(PALAVRAS))
        col = 1; s = ""
        for t in toks:
            s += "\x1b[%dG%s " % (col, t); col += larg(t) + 1
        print(s)
        esperado.append(" ".join(toks))
        sys.stdout.flush(); time.sleep(0.005)
    for i in range(random.randint(25, 45)): break
for i in (range(random.randint(25, 45)) if not modo.startswith("tui") else []):
    r = random.random()
    if r < 0.12:  # barra de progresso reescrita com \r
        rotulo = random.choice(EMOJIS[random.choice(grupos)])
        for p in range(0, 101, 20):
            sys.stdout.write("\r%s Processando %3d%% %s" % (rotulo, p, "█" * (p // 10)))
            sys.stdout.flush()
            time.sleep(0.01)
        sys.stdout.write("\n")
    elif r < 0.2:  # linha longa (quebra)
        print(" ".join(linha() for _ in range(3)))
    else:
        print(("  " * random.randint(0, 2)) + linha())
    if random.random() < 0.3:
        sys.stdout.flush(); time.sleep(0.005)
sys.stdout.flush()
cru = "".join(_cru) if not esperado else "\n".join(esperado) + "\n"
print("##PRONTO##", flush=True)
time.sleep(1.5)

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
h = k32.CreateFileW("CONOUT$", 0xC0000000, 3, None, 3, 0, None)
class COORD(ctypes.Structure): _fields_ = [("X", ctypes.c_short), ("Y", ctypes.c_short)]
class SMALL_RECT(ctypes.Structure): _fields_ = [("L", ctypes.c_short), ("T", ctypes.c_short), ("R", ctypes.c_short), ("B", ctypes.c_short)]
class CSBI(ctypes.Structure):
    _fields_ = [("size", COORD), ("cursor", COORD), ("attr", wintypes.WORD), ("win", SMALL_RECT), ("max", COORD)]
class CHAR_INFO(ctypes.Structure): _fields_ = [("ch", ctypes.c_wchar), ("attr", wintypes.WORD)]
info = CSBI(); k32.GetConsoleScreenBufferInfo(h, ctypes.byref(info))
w = info.win.R - info.win.L + 1; alt = info.win.B - info.win.T + 1
buf = (CHAR_INFO * (w * alt))()
reg = SMALL_RECT(info.win.L, info.win.T, info.win.R, info.win.B)
k32.ReadConsoleOutputW(h, buf, COORD(w, alt), COORD(0, 0), ctypes.byref(reg))
linhas = []
for y in range(alt):
    linhas.append([[buf[y * w + x].ch, buf[y * w + x].attr >> 8] for x in range(w)])
foto = {"w": w, "h": alt, "linhas": linhas, "cursor": [info.cursor.X, info.cursor.Y - info.win.T]}
# em pedaços pequenos e devagar: o ConPTY antigo perde o que rola para fora da tela entre um quadro e outro
b = "##CRU##" + base64.b64encode(cru.encode()).decode() + "##FIMCRU##"
for i in range(0, len(b), 600):
    _w(b[i:i + 600] + "\n"); sys.stdout.flush(); time.sleep(0.08)
