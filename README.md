# DC Siborong Borong (Cloudflare Workers)

**History Paket Bermasalah + Scan QR + Cek Resi SPX/Multi-Kurir + Stok**

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

---

## Struktur

```
dc-siborong-cf/
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── src/
│   └── index.js          ← API /api/track
├── wrangler.toml
├── package.json
└── README.md
```

---

## Cara Deploy ke Cloudflare

### 1. Upload ke GitHub
Buat repository baru, upload **semua isi folder ini**.

### 2. Hubungkan ke Cloudflare Pages / Workers
1. Buka [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. **Workers & Pages** → Create → Connect to Git
3. Pilih repository ini
4. Build settings:
   - Framework: None
   - Build command: *(kosong)* atau `npm install`
   - Deploy command / output: ikuti template **Worker** dengan `wrangler.toml`

Atau dari komputer (jika ada terminal):

```bash
npm install
npx wrangler deploy
```

### 3. (Opsional) Multi-kurir selain SPX
```bash
npx wrangler secret put BINDERBYTE_API_KEY
```
Daftar key di: https://binderbyte.com

### 4. Selesai
Aplikasi live di:
```
https://dc-siborong-borong.USERNAME.workers.dev
```

---

## PIN Default
`1234` — bisa diganti dari popup PIN → **Ubah PIN**

## Catatan
- Data history/stok disimpan di **LocalStorage browser** perangkat
- Cek resi SPX diproses di **server Cloudflare** (tidak kena CORS)
- Backup berkala dengan tombol Export CSV
