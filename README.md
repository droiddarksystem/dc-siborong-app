# DC Siborong Borong (Cloudflare Workers)

**History Paket Bermasalah + Scan QR + Cek Resi SPX/Multi-Kurir + Stok + Asisten Chatbot (Suara)**

Powered by **Amos rcpdroid ~86**

---

## Fitur

- 📦 History paket bermasalah (foto, status, keterangan)
- 📷 Scan QR / barcode
- 🔍 **Cek resi SPX otomatis** (via server Worker — tidak kena CORS)
- 🔍 Multi kurir: JNE, J&T, SiCepat, AnterAja, Pos, Ninja, Lion (butuh BinderByte API key)
- 📋 Data stok
- 📊 Laporan + Export CSV
- 🔐 PIN untuk Edit / Hapus (default: `1234`)
- 🖼️ Klik foto → tampil besar
- 📱 PWA (bisa di-install di HP)
- 💬 **Asisten Chatbot internal** (panel chat di dalam app)
- 🔊 **Google Text-to-Speech** (suara natural bahasa Indonesia) + fallback Web Speech API
- 🎤 Input suara (Speech-to-Text) di chatbot

---

## Asisten Chatbot

Tombol 💬 di pojok kanan bawah membuka panel asisten.

### Perintah contoh
| Perintah | Fungsi |
|----------|--------|
| `cek SPX123...` / `track TO...` | Cek resi langsung |
| `ringkas stok` / `stok kosong` | Ringkasan stok |
| `laporan hari ini` / `ringkas history` | Ringkasan paket bermasalah |
| `buka history` / `buka scan` / `buka stok` | Pindah tab |
| `export csv` | Unduh CSV history |
| `suara on` / `suara off` | Nyala/matikan suara otomatis |
| `bantuan` | Daftar perintah |

Setiap balasan bot punya tombol **🔊 Dengarkan**. Mic 🎤 untuk bicara (browser yang mendukung).

---

## Struktur

```
dc-siborong-app/
├── public/
│   ├── index.html          ← Frontend + Chatbot UI
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── src/
│   └── index.js            ← API /api/track + /api/tts + auth/sync
├── wrangler.toml
├── package.json
└── README.md
```

---

## Cara Deploy ke Cloudflare

### 1. Upload ke GitHub
Pastikan repository berisi semua file project ini.

### 2. Hubungkan ke Cloudflare Workers
1. Buka [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. **Workers & Pages** → Create → Connect to Git / atau pakai Wrangler
3. Build settings mengikuti `wrangler.toml`

Dari komputer:

```bash
npm install
npx wrangler deploy
```

### 3. Secret yang disarankan

```bash
# Multi-kurir selain SPX
npx wrangler secret put BINDERBYTE_API_KEY

# Auth JWT (disarankan ganti)
npx wrangler secret put AUTH_SECRET

# Google Cloud Text-to-Speech (untuk suara natural)
npx wrangler secret put GOOGLE_TTS_API_KEY
```

#### Setup Google TTS API Key
1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project / pilih project
3. Aktifkan **Cloud Text-to-Speech API**
4. Buat **API Key** (Credentials → Create credentials → API key)
5. (Opsional) Restrict key ke Text-to-Speech API saja
6. Jalankan: `npx wrangler secret put GOOGLE_TTS_API_KEY`

Tanpa key ini, chatbot tetap jalan dan memakai **Web Speech API** browser sebagai fallback.

### 4. Selesai
Aplikasi live di domain Workers / custom domain Anda.

---

## PIN Default
`1234` — bisa diganti dari popup PIN → **Ubah PIN**

## Catatan
- Data history/stok disimpan di **LocalStorage** browser perangkat
- Bisa login untuk sync ke **Cloudflare D1**
- Cek resi SPX diproses di **server Cloudflare** (tidak kena CORS)
- Backup berkala dengan tombol Export CSV
- Chatbot + suara tidak mengubah alur fitur lama
