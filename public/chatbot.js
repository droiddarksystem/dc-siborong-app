(function () {
  const CHAT_AUTO_SPEAK_KEY = 'dc_chat_auto_speak';
  let chatAutoSpeak = localStorage.getItem(CHAT_AUTO_SPEAK_KEY) !== '0';
  let chatListening = false;
  let chatRecognition = null;
  let currentAudio = null;

  function esc(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  window.toggleChatbot = function () {
    const panel = document.getElementById('chatbot-panel');
    const fab = document.getElementById('chatbot-fab');
    if (!panel) return;
    const open = panel.classList.toggle('open');
    if (fab) fab.classList.remove('has-unread');
    if (open) {
      if (!document.getElementById('chatbot-messages').children.length) {
        botSay(
          'Halo! Saya Asisten DC Siborong. Ketik perintah atau tekan tombol cepat di bawah.\n\nContoh:\n• cek SPX1234567890\n• ringkas stok\n• laporan hari ini\n• bantuan',
          false
        );
      }
      setTimeout(function () {
        const inp = document.getElementById('chatbot-input');
        if (inp) inp.focus();
      }, 150);
    }
  };

  window.clearChatbot = function () {
    const box = document.getElementById('chatbot-messages');
    if (box) box.innerHTML = '';
    botSay('Chat dikosongkan. Ada yang bisa dibantu?', false);
  };

  window.chatQuick = function (text) {
    const inp = document.getElementById('chatbot-input');
    if (inp) inp.value = text;
    sendChatMessage();
  };

  window.chatInputKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  function appendChatMsg(role, text) {
    const box = document.getElementById('chatbot-messages');
    if (!box) return null;
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    div.innerHTML = esc(text).replace(/\n/g, '<br>');
    if (role === 'bot') {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.innerHTML = '<span>Asisten</span>';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'speak-btn';
      btn.textContent = '🔊 Dengarkan';
      btn.onclick = function () { speakText(text); };
      meta.appendChild(btn);
      div.appendChild(meta);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function showTyping() {
    const box = document.getElementById('chatbot-messages');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'chat-typing';
    el.id = 'chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('chat-typing');
    if (el) el.remove();
  }

  async function botSay(text, speak) {
    if (speak === undefined) speak = true;
    hideTyping();
    appendChatMsg('bot', text);
    if (speak && chatAutoSpeak) await speakText(text);
  }

  window.toggleAutoSpeak = function () {
    chatAutoSpeak = !chatAutoSpeak;
    localStorage.setItem(CHAT_AUTO_SPEAK_KEY, chatAutoSpeak ? '1' : '0');
    const btn = document.getElementById('chatbot-voice-toggle');
    if (btn) {
      btn.textContent = chatAutoSpeak ? '🔊' : '🔇';
      btn.title = chatAutoSpeak ? 'Suara otomatis: ON' : 'Suara otomatis: OFF';
    }
    botSay(chatAutoSpeak ? 'Suara otomatis diaktifkan.' : 'Suara otomatis dimatikan.', false);
  };

  async function speakText(text) {
    if (!text) return;
    try { if (currentAudio) { currentAudio.pause(); currentAudio = null; } } catch (e) {}
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    const clean = String(text).replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!clean) return;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, lang: 'id-ID' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.audioContent) {
          const audio = new Audio('data:audio/mp3;base64,' + data.audioContent);
          currentAudio = audio;
          audio.onended = function () { currentAudio = null; };
          await audio.play();
          return;
        }
      }
    } catch (e) {}
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'id-ID';
      u.rate = 1;
      u.pitch = 1;
      try {
        const voices = speechSynthesis.getVoices();
        const idVoice = voices.find(function (v) {
          return /id(-|_)?ID|Indonesia/i.test(v.lang) || /Indonesia/i.test(v.name);
        });
        if (idVoice) u.voice = idVoice;
      } catch (e) {}
      speechSynthesis.speak(u);
    }
  }

  window.toggleVoiceInput = function () {
    const btn = document.getElementById('chatbot-mic');
    if (chatListening) { stopVoiceInput(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      botSay('Pengenalan suara tidak didukung di browser ini. Silakan ketik saja.', false);
      return;
    }
    chatRecognition = new SR();
    chatRecognition.lang = 'id-ID';
    chatRecognition.interimResults = false;
    chatRecognition.maxAlternatives = 1;
    chatRecognition.onstart = function () {
      chatListening = true;
      if (btn) btn.classList.add('listening');
    };
    chatRecognition.onend = function () {
      chatListening = false;
      if (btn) btn.classList.remove('listening');
    };
    chatRecognition.onerror = function () {
      chatListening = false;
      if (btn) btn.classList.remove('listening');
    };
    chatRecognition.onresult = function (ev) {
      const text = ev.results[0][0].transcript;
      const inp = document.getElementById('chatbot-input');
      if (inp) inp.value = text;
      sendChatMessage();
    };
    try { chatRecognition.start(); } catch (e) {}
  };

  function stopVoiceInput() {
    try { if (chatRecognition) chatRecognition.stop(); } catch (e) {}
    chatListening = false;
    const btn = document.getElementById('chatbot-mic');
    if (btn) btn.classList.remove('listening');
  }

  window.sendChatMessage = async function () {
    const input = document.getElementById('chatbot-input');
    if (!input) return;
    const text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    appendChatMsg('user', text);
    showTyping();
    try {
      const reply = await handleChatCommand(text);
      await botSay(reply, true);
    } catch (err) {
      await botSay('Maaf, terjadi kesalahan: ' + (err.message || 'error'), true);
    }
  };

  async function handleChatCommand(raw) {
    const text = String(raw || '').trim();
    const lower = text.toLowerCase();

    if (/^(bantuan|help|menu|perintah)\b/.test(lower) || lower === '?') {
      return 'Daftar perintah Asisten DC:\n\n📦 CEK RESI\n• cek SPX123... / track TO123...\n• cek resi <nomor>\n\n📋 HISTORY & STOK\n• ringkas history / history hari ini\n• ringkas stok / stok kosong\n• laporan hari ini\n\n⚡ AKSI CEPAT\n• buka history / buka scan / buka stok\n• export csv\n\n🔊 SUARA\n• suara on / suara off\n• Mic 🎤 untuk bicara\n\nKetik saja perintahnya, contoh: cek SPX1234567890';
    }

    if (/suara\s*(on|nyala|aktif)/i.test(lower)) {
      chatAutoSpeak = true;
      localStorage.setItem(CHAT_AUTO_SPEAK_KEY, '1');
      const btn = document.getElementById('chatbot-voice-toggle');
      if (btn) btn.textContent = '🔊';
      return 'Suara otomatis diaktifkan. Saya akan membacakan balasan.';
    }
    if (/suara\s*(off|mati|nonaktif)/i.test(lower)) {
      chatAutoSpeak = false;
      localStorage.setItem(CHAT_AUTO_SPEAK_KEY, '0');
      const btn = document.getElementById('chatbot-voice-toggle');
      if (btn) btn.textContent = '🔇';
      return 'Suara otomatis dimatikan.';
    }

    if (typeof showTab === 'function') {
      if (/buka\s*(history|histori)/i.test(lower)) { showTab('history'); return 'Membuka panel History.'; }
      if (/buka\s*scan/i.test(lower)) { showTab('scan'); return 'Membuka panel Scan QR.'; }
      if (/buka\s*cek|buka\s*resi/i.test(lower)) { showTab('cek'); return 'Membuka panel Cek Resi.'; }
      if (/buka\s*stok/i.test(lower)) { showTab('stok'); return 'Membuka panel Stok.'; }
      if (/buka\s*(sj|surat)/i.test(lower)) { showTab('sj'); return 'Membuka panel Surat Jalan.'; }
      if (/buka\s*laporan/i.test(lower)) { showTab('laporan'); return 'Membuka panel Laporan.'; }
    }

    if (/export\s*csv|unduh\s*csv|download\s*csv/i.test(lower)) {
      try {
        if (typeof exportCSV === 'function') exportCSV();
        return 'File CSV history sedang diunduh.';
      } catch (e) { return 'Gagal export CSV.'; }
    }

    const resiMatch =
      text.match(/(?:cek|track|lacak)\s+(?:resi\s+)?([A-Za-z0-9\-]{6,})/i) ||
      text.match(/\b((?:SPX|TO|JP|JT|SCP|SC|JNE|NINJA|POS)[A-Za-z0-9\-]{5,})\b/i);
    if (resiMatch) {
      let resi = resiMatch[1] || resiMatch[0];
      if (typeof cleanResi === 'function') resi = cleanResi(resi);
      else resi = String(resi).trim().toUpperCase();
      try {
        if (typeof trackResi !== 'function') return 'Fungsi tracking belum siap.';
        const result = await trackResi(resi, 'auto');
        return formatTrackResultForChat(result, resi);
      } catch (e) {
        return 'Gagal cek resi ' + resi + ': ' + (e.message || 'error');
      }
    }
    if (/^cek\s*resi\b/i.test(lower) || lower === 'cek resi') {
      return 'Silakan ketik: cek <nomor resi>\nContoh: cek SPX1234567890';
    }

    if (/ringkas\s*stok|stok\s*kosong|lihat\s*stok|info\s*stok/i.test(lower)) {
      return summarizeStok(lower.indexOf('kosong') >= 0);
    }
    if (/ringkas\s*history|history\s*hari\s*ini|laporan\s*hari\s*ini|ringkas\s*laporan|laporan/i.test(lower)) {
      return summarizeHistory(lower.indexOf('hari ini') >= 0 || lower.indexOf('laporan') >= 0);
    }

    return 'Maaf, saya belum paham perintah itu.\nKetik **bantuan** untuk melihat daftar perintah, atau langsung: cek SPX123...';
  }

  function formatTrackResultForChat(result, resi) {
    if (!result) return 'Tidak ada hasil untuk ' + resi;
    if (!result.success) {
      return 'Resi ' + resi + ' tidak ditemukan / gagal.\n' + (result.message || '') +
        (result.officialUrl ? '\nCek manual: ' + result.officialUrl : '');
    }
    let status = '', receiver = '', historyLines = [];
    try {
      const d = result.data || {};
      if (d.data && d.data.sls_tracking_number) {
        status = (d.data.tracking_status_name || d.data.status || '').toString();
        const hist = d.data.tracking_list || d.data.tracking || [];
        if (Array.isArray(hist)) {
          historyLines = hist.slice(0, 4).map(function (h) {
            const t = h.timestamp || h.time || h.date || '';
            const m = h.message || h.description || h.status || '';
            return '• ' + m + (t ? ' (' + t + ')' : '');
          });
        }
      } else if (d.detail || d.summary) {
        status = (d.detail && d.detail.status) || (d.summary && d.summary.status) || '';
        receiver = (d.detail && d.detail.receiver) || '';
        const hist = d.history || [];
        if (Array.isArray(hist)) {
          historyLines = hist.slice(0, 4).map(function (h) {
            return '• ' + (h.desc || h.status || h.note || JSON.stringify(h));
          });
        }
      } else if (typeof extractStatusText === 'function') {
        status = extractStatusText(result) || '';
      }
    } catch (e) {}
    let out = '📦 Resi: ' + resi + '\nKurir: ' + (result.courier || '-').toUpperCase();
    if (status) out += '\nStatus: ' + status;
    if (receiver) out += '\nPenerima: ' + receiver;
    if (historyLines.length) out += '\n\nRiwayat terakhir:\n' + historyLines.join('\n');
    return out;
  }

  function summarizeStok(onlyEmpty) {
    if (typeof getData !== 'function') return 'Data stok belum tersedia.';
    const data = getData();
    const stok = data.stok || [];
    if (!stok.length) return 'Belum ada data stok.';
    let list = stok;
    if (onlyEmpty) {
      list = stok.filter(function (s) { return Number(s.qty || s.jumlah || 0) <= 0; });
      if (!list.length) return 'Tidak ada stok yang kosong. Semua item masih tersedia.';
    }
    const lines = list.slice(0, 12).map(function (s) {
      const nama = s.nama || s.name || s.item || '-';
      const qty = s.qty != null ? s.qty : s.jumlah != null ? s.jumlah : '-';
      return '• ' + nama + ' — ' + qty;
    });
    const more = list.length > 12 ? '\n...dan ' + (list.length - 12) + ' lainnya' : '';
    return (onlyEmpty ? 'Stok kosong:\n' : 'Ringkasan stok (' + stok.length + ' item):\n') + lines.join('\n') + more;
  }

  function summarizeHistory(todayOnly) {
    if (typeof getData !== 'function') return 'Data history belum tersedia.';
    const data = getData();
    let hist = data.history || [];
    if (todayOnly) {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
      hist = hist.filter(function (h) {
        const t = new Date(h.created_at || h.tanggal || h.date || 0);
        return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
      });
    }
    if (!hist.length) return todayOnly ? 'Belum ada history paket hari ini.' : 'Belum ada data history.';
    const byMasalah = {};
    hist.forEach(function (h) {
      const k = h.masalah || h.jenis || 'Lainnya';
      byMasalah[k] = (byMasalah[k] || 0) + 1;
    });
    const lines = Object.keys(byMasalah).map(function (k) { return '• ' + k + ': ' + byMasalah[k]; });
    return (todayOnly ? 'Laporan hari ini' : 'Ringkasan history') + ' — total ' + hist.length + ' paket:\n' + lines.join('\n');
  }

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('chatbot-voice-toggle');
    if (btn) btn.textContent = chatAutoSpeak ? '🔊' : '🔇';
  });
  const btn = document.getElementById('chatbot-voice-toggle');
  if (btn) btn.textContent = chatAutoSpeak ? '🔊' : '🔇';
  if ('speechSynthesis' in window) {
    try {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = function () { speechSynthesis.getVoices(); };
    } catch (e) {}
  }
})();
