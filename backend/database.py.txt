# database.py
from sqlalchemy import create_engine, Column, Integer, String, DateTime, UnicodeText
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker#, relationship
from datetime import datetime, timezone

# SQL Server bağlantı bilgileri
username = "sa"
password = "sa350906"
server = "DESKTOP-FVALNFB\\SQLEXPRESS"
database = "db_BasitChat"
driver = "ODBC Driver 17 for SQL Server"

DATABASE_URL = f"mssql+pyodbc://{username}:{password}@{server}/{database}?driver={driver.replace(' ', '+')}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Kullanici(Base):
    __tablename__ = "Giriş"

    Id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    KullaniciAdi = Column(String, unique=True, index=True, nullable=False)
    Sifre = Column(String, nullable=False)

# Dependency fonksiyonu: db oturumu sağlamak için
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class Mesaj(Base):
    __tablename__ = "Mesajlar"

    Id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    KullaniciAdi = Column(String, nullable=False)
    Alici = Column(String, nullable=True)  # Alıcı boş ise grup mesajı olarak değerlendirilebilir
    Icerik = Column(UnicodeText, nullable=False)
    Zaman = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc).replace(microsecond=0))
