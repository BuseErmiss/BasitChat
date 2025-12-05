from sqlalchemy import create_engine, Column, Integer, String, DateTime, UnicodeText
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone
import os

# Proje içinde sqlite dosyası oluşturulacak
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'chat.db')}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


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
