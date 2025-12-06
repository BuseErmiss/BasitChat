from sqlalchemy import create_engine, Column, Integer, String, DateTime, UnicodeText
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone
import os

# --- VERİTABANI AYARLARI ---

# 1. Render'dan gelen DATABASE_URL var mı diye bakıyoruz
DATABASE_URL = os.environ.get("DATABASE_URL")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. Ayarları duruma göre belirliyoruz
if DATABASE_URL:
    # --- RENDER (POSTGRESQL) ---
    # Render 'postgres://' verir ama SQLAlchemy 'postgresql://' ister, düzeltiyoruz.
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    
    # PostgreSQL için özel argümana gerek yok, boş bırakıyoruz
    connect_args = {}
else:
    # --- YEREL BİLGİSAYAR (SQLITE) ---
    DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'chat.db')}"
    # SQLite için bu ayar gereklidir
    connect_args = {"check_same_thread": False}

# 3. Engine'i oluşturuyoruz (Dinamik ayarlarla)
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# --- TABLO MODELLERİ ---

class Kullanici(Base):
    __tablename__ = "kullanicilar"

    Id = Column(Integer, primary_key=True, index=True)
    KullaniciAdi = Column(String, unique=True, index=True, nullable=False)
    Sifre = Column(String, nullable=False)


class Mesaj(Base):
    __tablename__ = "mesajlar"

    Id = Column(Integer, primary_key=True, index=True)
    KullaniciAdi = Column(String, nullable=False)
    Alici = Column(String, nullable=True)
    Icerik = Column(UnicodeText, nullable=False)
    Zaman = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc).replace(microsecond=0)
    )


# Veritabanı tablolarını oluştur
def init_db():
    Base.metadata.create_all(bind=engine)


# DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()