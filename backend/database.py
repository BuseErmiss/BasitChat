# database.py
from sqlalchemy import create_engine, Column, Integer, String, DateTime, UnicodeText
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone

# ==========================
#   Render ile UYUMLU SQLite
# ==========================
DATABASE_URL = "sqlite:///./chat.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # SQLite için gerekli
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class Kullanici(Base):
    __tablename__ = "kullanicilar"

    Id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    KullaniciAdi = Column(String, unique=True, index=True, nullable=False)
    Sifre = Column(String, nullable=False)


class Mesaj(Base):
    __tablename__ = "mesajlar"

    Id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    KullaniciAdi = Column(String, nullable=False)
    Alici = Column(String, nullable=True)
    Icerik = Column(UnicodeText, nullable=False)
    Zaman = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc).replace(microsecond=0))


# DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
