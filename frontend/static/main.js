import { EmojiButton } from 'https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@4.6.4/dist/index.min.js';

let ws;
let typingUsers = new Set();
let onlineUsers = new Set();
let yaziyorTimeout;

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

    displayMessage(msg);
  };

  ws.onclose = () => {
    alert("Sunucuyla bağlantı koptu. Yeniden bağlanılıyor...");
    document.getElementById("message").disabled = true;
    document.getElementById("sendBtn").disabled = true;
    setTimeout(connect, 3000);
  };
}

function sendMessage() {
  const msg = document.getElementById("message").value.trim();
  const recipient = document.getElementById("recipient").value;

  if (!msg) return;

  const mesajObjesi = {
    gonderen: username,
    alici: recipient || "",
    icerik: msg
  };

  ws.send(JSON.stringify(mesajObjesi));
  document.getElementById("message").value = "";
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function displayMessage(msg) {
  const chatbox = document.getElementById("chatbox");
  const isOwn = msg.gonderen === username;

  const div = document.createElement("div");
  div.classList.add("message", isOwn ? "own-message" : "other-message");
  if (msg.alici) {
    div.classList.add("private-message");
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

  // Kullanıcı adı ve içerik
  const strong = document.createElement("strong");
  strong.textContent = msg.gonderen + (msg.alici ? ` ➡ ${msg.alici}` : "");
  strong.style.color = renk;
  strong.style.marginRight = "6px";

  // Zaman etiketi
  const timeSpan = document.createElement("span");
  timeSpan.textContent = `[${zaman}] `;
  timeSpan.style.opacity = "0.6";
  timeSpan.style.marginRight = "6px";

  // Mesaj içeriği
  const content = document.createElement("span");
  content.innerHTML = escapeHtml(msg.icerik);

  // İçerikleri saran kutu
  const textWrapper = document.createElement("div");
  textWrapper.appendChild(timeSpan);
  textWrapper.appendChild(strong);
  textWrapper.appendChild(content);

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
      sound.play();
    }
  }
}

function updateTypingIndicator() {
  const yazanlar = [...typingUsers].filter(u => u !== username);
  document.getElementById("typing-user").textContent = yazanlar.join(", ");
  document.querySelector(".dot-anim").style.visibility = yazanlar.length ? "visible" : "hidden";
}

function updateRecipientList() {
  const select = document.getElementById("recipient");
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
    option.textContent = user;
    select.appendChild(option);
  });
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

  document.getElementById("toggleDarkMode").addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const toggleBtn = document.getElementById("toggleDarkMode");
    toggleBtn.textContent = document.body.classList.contains("dark-mode")
      ? "☀️ Light Mode"
      : "🌙 Dark Mode";
  });

  // 👇👇 EMOJI PICKER sadece burada başlasın
  const picker = new EmojiButton({
    position: 'top-start', // Emoji picker'ın konumu
    zIndex: 10000
  });

  const emojiBtn = document.getElementById('emojiBtn');
  const input = document.getElementById('message');

  emojiBtn.addEventListener('click', () => {
    picker.togglePicker(emojiBtn);
  });

  picker.on('emoji', emoji => {
    input.value += emoji.emoji;
    input.focus();
  });
});

// 🔵 Avatar renkleri için sabit renk algoritması
const userColors = {};  // Kullanıcılara renk atamak için
function getColorForUser(username) {
  if (userColors[username]) return userColors[username];

  // Her kullanıcıya sabit bir renk üret
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }

  const color = `hsl(${hash % 360}, 60%, 70%)`; // pastel renk üret
  userColors[username] = color;
  return color;
}
