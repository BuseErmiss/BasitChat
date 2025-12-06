import { EmojiButton } from 'https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@4.6.4/dist/index.min.js';

let ws;
let typingUsers = new Set();
let onlineUsers = new Set();
let yaziyorTimeout;

// Global değişkene kullanıcı adını al (HTML'den geliyor)
// (index.html içindeki <script>const username = ...</script> sayesinde)

function connect() {
  if (!username) {
    alert("Kullanıcı adı alınamadı.");
    return;
  }

  const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    document.getElementById("message").disabled = false;
    document.getElementById("sendBtn").disabled = false;
    console.log("WebSocket Bağlandı ✅");
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case "yaziyor":
        typingUsers.add(msg.gonderen);
        updateTypingIndicator();
        return;
      case "durdu":
        typingUsers.delete(msg.gonderen);
        updateTypingIndicator();
        return;
      case "status":
        msg.online
          ? onlineUsers.add(msg.kullanici)
          : onlineUsers.delete(msg.kullanici);
        updateRecipientList();
        return;
      case "status-list":
        onlineUsers = new Set(msg.kullanicilar);
        updateRecipientList();
        return;
    }

    // Normal mesaj ise ekrana bas
    displayMessage(msg);
  };

  ws.onclose = () => {
    console.log("Bağlantı koptu, tekrar deneniyor...");
    document.getElementById("message").disabled = true;
    document.getElementById("sendBtn").disabled = true;
    setTimeout(connect, 3000);
  };
}

function sendMessage() {
  const msgInput = document.getElementById("message");
  const msg = msgInput.value.trim();
  const recipient = document.getElementById("recipient").value;

  if (!msg) return;

  const mesajObjesi = {
    gonderen: username,
    alici: recipient || "",
    icerik: msg,
    type: "mesaj"
  };

  ws.send(JSON.stringify(mesajObjesi));
  msgInput.value = "";
  
  // Mesaj gönderince yazıyor bilgisini hemen durdur
  ws.send(JSON.stringify({ type: "durdu", gonderen: username }));
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 🔥 GÜNCELLENEN KISIM: displayMessage
function displayMessage(msg) {
  const chatbox = document.getElementById("chatbox");
  const isOwn = msg.gonderen === username;

  const div = document.createElement("div");
  div.classList.add("message", isOwn ? "own-message" : "other-message");
  if (msg.alici) {
    div.classList.add("private-message");
  }

  // 🔥 Mesajın ID'sini elemente ekle (Silme işlemi için gerekli)
  if (msg.id) {
    div.id = "msg-" + msg.id;
  }

  // Tarih formatı
  const zaman = new Date(msg.zaman).toLocaleString("tr-TR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  });

  // Renk belirle
  const renk = getColorForUser(msg.gonderen);

  // Avatar (baş harf)
  const avatar = document.createElement("span");
  avatar.textContent = msg.gonderen[0].toUpperCase();
  avatar.classList.add("avatar");
  avatar.style.backgroundColor = renk;
  avatar.title = msg.gonderen;

  // Kullanıcı adı ve ok işareti
  const strong = document.createElement("strong");
  strong.textContent = msg.gonderen + (msg.alici ? ` ➡ ${msg.alici}` : "");
  strong.style.color = renk;
  strong.style.marginRight = "6px";

  // Zaman etiketi
  const timeSpan = document.createElement("span");
  timeSpan.textContent = `[${zaman}] `;
  timeSpan.style.opacity = "0.6";
  timeSpan.style.marginRight = "6px";
  timeSpan.style.fontSize = "0.8em";

  // Mesaj içeriği
  const content = document.createElement("span");
  content.innerHTML = escapeHtml(msg.icerik);

  // 🔥 SİLME BUTONU EKLEME KISMI
  let deleteBtn = null;
  if (isOwn && msg.id) {
      deleteBtn = document.createElement("span");
      deleteBtn.textContent = "❌"; // İstersen 🗑️ yapabilirsin
      deleteBtn.className = "delete-btn"; // CSS için sınıf
      deleteBtn.title = "Mesajı Sil";
      deleteBtn.style.cursor = "pointer";
      deleteBtn.style.marginLeft = "10px";
      
      // Tıklanınca silme fonksiyonunu çağır
      deleteBtn.onclick = function() {
          deleteMessage(msg.id);
      };
  }

  // İçerikleri saran kutu
  const textWrapper = document.createElement("div");
  textWrapper.appendChild(timeSpan);
  textWrapper.appendChild(strong);
  textWrapper.appendChild(content);

  // Eğer silme butonu oluşturulduysa ekle
  if (deleteBtn) {
      textWrapper.appendChild(deleteBtn);
  }

  // Tüm bileşenleri ana div'e ekle
  div.appendChild(avatar);
  div.appendChild(textWrapper);

  // Chatbox'a ekle ve aşağı kaydır
  chatbox.appendChild(div);
  chatbox.scrollTop = chatbox.scrollHeight;

  // Ses çal (başkası gönderdiğinde)
  if (!isOwn) {
    const sound = document.getElementById("messageSound");
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(e => console.log("Ses çalma engellendi"));
    }
  }
}

// 🔥 YENİ EKLENEN FONKSİYON: Mesaj Silme
async function deleteMessage(id) {
    if (!confirm("Bu mesajı silmek istediğine emin misin?")) return;

    try {
        const response = await fetch(`/delete_message/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Başarılıysa HTML elementini kaldır
            const element = document.getElementById("msg-" + id);
            if (element) {
                // Hafif bir animasyonla sil
                element.style.opacity = "0";
                setTimeout(() => element.remove(), 300);
            }
        } else {
            alert("Mesaj silinemedi! Yetkiniz olmayabilir.");
        }
    } catch (error) {
        console.error("Silme hatası:", error);
    }
}

function updateTypingIndicator() {
  const yazanlar = [...typingUsers].filter(u => u !== username);
  document.getElementById("typing-user").textContent = yazanlar.join(", ");
  document.querySelector(".dot-anim").style.visibility = yazanlar.length ? "visible" : "hidden";
}

function updateRecipientList() {
  const select = document.getElementById("recipient");
  // Mevcut seçimi koru
  const currentSelection = select.value;
  
  select.innerHTML = `<option value="">Herkese</option>`;

  const users = [...onlineUsers].sort((a, b) => {
    if (a === username) return -1;
    if (b === username) return 1;
    return a.localeCompare(b, 'tr');
  });

  users.forEach(user => {
    if (user === username) return;
    const option = document.createElement("option");
    option.value = user;
    option.textContent = user + " 🟢";
    select.appendChild(option);
  });

  // Eğer eski seçilen kullanıcı hala onlinedaysa onu seçili bırak
  if (onlineUsers.has(currentSelection)) {
      select.value = currentSelection;
  }
}

window.addEventListener("load", () => {
  connect();

  const msgInput = document.getElementById("message");

  msgInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  msgInput.addEventListener("input", () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "yaziyor", gonderen: username }));
    }

    clearTimeout(yaziyorTimeout);
    yaziyorTimeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "durdu", gonderen: username }));
      }
    }, 2000);
  });

  document.getElementById("sendBtn").addEventListener("click", sendMessage);

  const darkModeBtn = document.getElementById("toggleDarkMode");
  if(darkModeBtn) {
      darkModeBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        darkModeBtn.textContent = document.body.classList.contains("dark-mode")
          ? "☀️ Light Mode"
          : "🌙 Dark Mode";
      });
  }

  // EMOJI PICKER
  if (window.EmojiButton) {
      const picker = new EmojiButton({
        position: 'top-start',
        zIndex: 10000
      });

      const emojiBtn = document.getElementById('emojiBtn');
      const input = document.getElementById('message');

      if (emojiBtn && input) {
          emojiBtn.addEventListener('click', () => {
            picker.togglePicker(emojiBtn);
          });

          picker.on('emoji', emoji => {
            input.value += emoji.emoji;
            input.focus();
          });
      }
  }
});

// Avatar renkleri
const userColors = {};
function getColorForUser(username) {
  if (userColors[username]) return userColors[username];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = `hsl(${hash % 360}, 60%, 70%)`;
  userColors[username] = color;
  return color;
}