from fastapi import FastAPI, Request, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Dict
from pathlib import Path
import json
import pytz
import re

from backend.database import get_db, Kullanici, Mesaj, init_db
from backend.utils import hash_password, verify_password

app = FastAPI()

# 🔥 VERITABANI TABLOLARINI OLUŞTUR
init_db()

# 🔥 Render için DOĞRU STATIC ve TEMPLATE PATH AYARI
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = (BASE_DIR / "../frontend/static").resolve()
TEMPLATE_DIR = (BASE_DIR / "../frontend/templates").resolve()

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATE_DIR)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

istanbul = pytz.timezone('Europe/Istanbul')

@app.get("/")
async def root():
    return RedirectResponse(url="/login")

@app.get("/register")
async def register_get(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

def sifre_gecerli_mi(sifre: str) -> bool:
    return (
        len(sifre) >= 8
        and re.search(r"[A-Z]", sifre)
        and re.search(r"\d", sifre)
    )

@app.post("/register")
async def register(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    username = str(form.get("username") or "")
    password = str(form.get("password") or "")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Eksik bilgi")

    if not sifre_gecerli_mi(password):
        raise HTTPException(status_code=400, detail="Şifre zayıf")

    existing_user = db.query(Kullanici).filter(Kullanici.KullaniciAdi == username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Kullanıcı zaten var")

    hashed_pw = hash_password(password)
    yeni = Kullanici(KullaniciAdi=username, Sifre=hashed_pw)
    db.add(yeni)
    db.commit()

    return RedirectResponse(url="/login", status_code=302)

@app.get("/login")
async def login_get(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    username = str(form.get("username") or "")
    password = str(form.get("password") or "")

    user = db.query(Kullanici).filter(Kullanici.KullaniciAdi == username).first()

    if not user or not verify_password(password, user.Sifre):
        raise HTTPException(status_code=401, detail="Geçersiz giriş")

    response = RedirectResponse(url="/index", status_code=302)
    response.set_cookie(key="username", value=username)
    return response

def get_current_user(request: Request, db: Session = Depends(get_db)) -> Kullanici:
    username = request.cookies.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Giriş gerekli")

    user = db.query(Kullanici).filter(Kullanici.KullaniciAdi == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı yok")

    return user

@app.get("/index")
async def index_page(request: Request, user: Kullanici = Depends(get_current_user)):
    return templates.TemplateResponse("index.html", {"request": request, "username": user.KullaniciAdi})

@app.get("/chat")
async def chat_page(request: Request, user: Kullanici = Depends(get_current_user)):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "username": user.KullaniciAdi
    })


# --- WebSocket Kısmı Aynen ---

# --- WebSocket Kısmı ---

clients: Dict[str, WebSocket] = {}


async def send_chat_history(websocket: WebSocket, db: Session, username: str):
    mesajlar = db.query(Mesaj).filter(
        or_(
            Mesaj.Alici == None,
            Mesaj.Alici == username,
            Mesaj.KullaniciAdi == username
        )
    ).order_by(Mesaj.Zaman.desc()).limit(50).all()

    mesajlar = mesajlar[::-1]

    for mesaj in mesajlar:
        formatted_time = mesaj.Zaman.astimezone(istanbul).isoformat()

        mesaj_str = json.dumps({
            "gonderen": mesaj.KullaniciAdi,
            "alici": mesaj.Alici,
            "icerik": mesaj.Icerik,
            "zaman": formatted_time
        })
        await websocket.send_text(mesaj_str)


async def broadcast_user_status(gelen_kullanici: str, online: bool):
    durum_mesaji = json.dumps({
        "type": "status",
        "kullanici": gelen_kullanici,
        "online": online
    })

    for user, client_ws in clients.items():
        if user != gelen_kullanici:
            await client_ws.send_text(durum_mesaji)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()

    username = websocket.cookies.get("username")
    if not username:
        await websocket.close()
        return

    # Aynı kullanıcı yeniden bağlanıyorsa eski bağlantıyı kapat
    if username in clients:
        try:
            await clients[username].close()
        except:
            pass

    clients[username] = websocket

    await websocket.send_text(json.dumps({
        "type": "status-list",
        "kullanicilar": list(clients.keys())
    }))

    await broadcast_user_status(username, True)
    await send_chat_history(websocket, db, username)

    try:
        while True:
            data = await websocket.receive_text()
            mesaj_verisi = json.loads(data)

            tip = mesaj_verisi.get("type", "mesaj")

            # Yazıyor bildirimi
            if tip == "yaziyor":
                for user, ws in clients.items():
                    if user != username:
                        await ws.send_text(json.dumps({
                            "type": "yaziyor",
                            "gonderen": username
                        }))
                continue

            if tip == "durdu":
                for user, ws in clients.items():
                    if user != username:
                        await ws.send_text(json.dumps({
                            "type": "durdu",
                            "gonderen": username
                        }))
                continue

            # Normal mesaj kaydı
            gonderen = mesaj_verisi.get("gonderen")
            alici = mesaj_verisi.get("alici") or None
            icerik = mesaj_verisi.get("icerik")

            yeni_mesaj = Mesaj(KullaniciAdi=gonderen, Alici=alici, Icerik=icerik)
            db.add(yeni_mesaj)
            db.commit()
            db.refresh(yeni_mesaj)

            zaman_obj = yeni_mesaj.Zaman.astimezone(istanbul)
            mesaj_str = json.dumps({
                "gonderen": gonderen,
                "alici": alici,
                "icerik": icerik,
                "zaman": zaman_obj.isoformat(),
                "zaman_etiketi": zaman_obj.strftime("%d.%m.%Y %H:%M:%S")
            })

            # Özel mesaj
            if alici:
                for u, ws in clients.items():
                    if u in [alici, gonderen]:
                        await ws.send_text(mesaj_str)

            # Grup mesajı
            else:
                for ws in clients.values():
                    await ws.send_text(mesaj_str)

    except WebSocketDisconnect:
        pass

    finally:
        clients.pop(username, None)
        await broadcast_user_status(username, False)
# --- WebSocket Kısmı Sonu ---