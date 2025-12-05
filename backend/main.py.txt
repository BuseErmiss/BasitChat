from fastapi import FastAPI, Request, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Dict
from database import get_db, Kullanici, Mesaj
import json
from utils import hash_password, verify_password
import pytz
import re

app = FastAPI()

app.mount("/static", StaticFiles(directory="../frontend/static"), name="static")
templates = Jinja2Templates(directory="../frontend/templates")

# CORS ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

istanbul = pytz.timezone('Europe/Istanbul') # İstanbul saat dilimi objesi

# Ana sayfa - login'e yönlendir
@app.get("/")
async def root():
    return RedirectResponse(url="/login")

# Kayıt sayfası
@app.get("/register")
async def register_get(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

def sifre_gecerli_mi(sifre: str) -> bool:
    if len(sifre) < 8:
        return False
    if not re.search(r"[A-Z]", sifre):  # en az 1 büyük harf
        return False
    if not re.search(r"\d", sifre):  # en az 1 rakam
        return False
    return True

# Kayıt işlemi POST
@app.post("/register")
async def register(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    username = str(form.get("username") or "")
    password = str(form.get("password") or "")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Eksik bilgi")
    
    if not sifre_gecerli_mi(password):
        raise HTTPException(
            status_code=400,
            detail="Şifre en az 8 karakter, 1 büyük harf ve 1 rakam içermelidir."
        )

    existing_user = db.query(Kullanici).filter(Kullanici.KullaniciAdi == username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Kullanıcı zaten var")

    hashed_pw = hash_password(password)
    yeni = Kullanici(KullaniciAdi=username, Sifre=hashed_pw)
    db.add(yeni)
    db.commit()

    return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)

# Giriş sayfası
@app.get("/login")
async def login_get(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

# Giriş işlemi POST
@app.post("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    username = str(form.get("username") or "")
    password = str(form.get("password") or "")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Eksik bilgi")

    user = db.query(Kullanici).filter(Kullanici.KullaniciAdi == username).first()

    if not user or not verify_password(password, str(user.Sifre)):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")

    response = RedirectResponse(url="/index", status_code=status.HTTP_302_FOUND)
    response.set_cookie(key="username", value=username)
    return response

def get_current_user(request: Request, db: Session = Depends(get_db)) -> Kullanici:
    username = request.cookies.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Giriş gerekli")

    user = db.query(Kullanici).filter(Kullanici.KullaniciAdi == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")

    return user

# Anasayfa
@app.get("/index")
async def index_page(request: Request, user: Kullanici = Depends(get_current_user)):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "username": user.KullaniciAdi
    })

# Chat sayfası
@app.get("/chat")
async def chat_page(request: Request, user: Kullanici = Depends(get_current_user)):
    return templates.TemplateResponse("chat.html", {
        "request": request,
        "username": user.KullaniciAdi
    })

clients: Dict[str, WebSocket] = {}

async def send_chat_history(websocket: WebSocket, db: Session, username: str):
    mesajlar = db.query(Mesaj).filter(
        or_(
            Mesaj.Alici == None,
            Mesaj.Alici == username,
            Mesaj.KullaniciAdi == username
        )
    ).order_by(Mesaj.Zaman.desc()).limit(50).all()
    mesajlar = mesajlar[::-1]  # Ters çevir, en son mesaj en altta görünsün

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
        if user != gelen_kullanici:  # Kendisine göndermiyoruz
            await client_ws.send_text(durum_mesaji)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()

    username = websocket.cookies.get("username")
    if not username:
        await websocket.close()
        return    
    
    # Aynı kullanıcı daha önce bağlandıysa, önceki bağlantıyı kapat
    if username in clients:
        try:
            await clients[username].close()
        except Exception as e:
            print(f"Eski WebSocket kapatılamadı: {e}")
            
    # Yeni bağlantıyı kaydet
    clients[username] = websocket

    await websocket.send_text(json.dumps({
        "type": "status-list",
        "kullanicilar": list(clients.keys())
    }))
    
    await broadcast_user_status(username, online=True)

    await send_chat_history(websocket, db, username)

    try:
        while True:
            data = await websocket.receive_text()
            mesaj_verisi = json.loads(data)

            tip = mesaj_verisi.get("type", "mesaj")

            if tip == "yaziyor":
                # Diğer tüm kullanıcılara bildir
                for user, client_ws in clients.items():
                    if user != username:
                        await client_ws.send_text(json.dumps({
                            "type": "yaziyor",
                            "gonderen": username
                        }))
                continue

            elif tip == "durdu":
                for user, client_ws in clients.items():
                    if user != username:
                        await client_ws.send_text(json.dumps({
                            "type": "durdu",
                            "gonderen": username
                        }))
                continue

            gonderen = mesaj_verisi.get("gonderen")
            alici_raw = mesaj_verisi.get("alici")
            alici = alici_raw if alici_raw else None  # "" yerine None kullan

            icerik = mesaj_verisi.get("icerik")

            yeni_mesaj = Mesaj(KullaniciAdi=gonderen, Alici=alici, Icerik=icerik)
            db.add(yeni_mesaj)
            db.commit()
            db.refresh(yeni_mesaj)

            zaman_obj = yeni_mesaj.Zaman.astimezone(istanbul)
            iso_zaman = zaman_obj.isoformat()
            zaman_etiketi = zaman_obj.strftime("%d.%m.%Y %H:%M:%S")

            mesaj_str = json.dumps({
                "gonderen": gonderen,
                "alici": alici,
                "icerik": icerik,
                "zaman": iso_zaman,
                "zaman_etiketi": zaman_etiketi
            })

            if alici:
                # Özel mesaj: sadece gönderici ve alıcıya gönder
                for user, client_ws in clients.items():
                    if user in [alici, gonderen]:
                        await client_ws.send_text(mesaj_str)
            else:
                # Grup mesajı: herkese gönder
                for client_ws in clients.values():
                    await client_ws.send_text(mesaj_str)
            
    except WebSocketDisconnect:
        pass
    finally:
        clients.pop(username, None) 
        await broadcast_user_status(username, online=False)
