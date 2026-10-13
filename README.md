# Mahjong Online (Aturan Resmi Tiongkok / MCR)

Game Mahjong multiplayer online berbasis web, mengikuti *A Guide to Mahjong — Chinese / Official International Rules*. Tanpa dependency: cukup Node.js ≥ 18.

## Menjalankan

```bash
cd mahjong-online
npm start            # atau: node server.js   (PORT=3000 default)
```

Buka `http://localhost:3000`, isi nama, klik **Buat Room Baru**, bagikan link `/?room=KODE` ke teman (maks 4 orang), lalu host klik **Mulai Permainan**. Kursi kosong diisi bot.

## Fitur

- 144 tile (termasuk 8 Bunga/Musim), tembok mati 14 tile, dealer 14 tile, penggantian bunga dan Kong.
- Klaim Chow (hanya dari pemain di kiri), Pung, Kong, Mahjong. Prioritas: Mahjong > Pung/Kong > Chow, dan kalau ada dua klaim Mahjong, yang menang pemain paling dekat di kanan pembuang.
- Kong tertutup, tambah Kong (Pung jadi Kong), dan merampok Kong (*Robbing the Kong*).
- Penilaian 81 fan beserta aturan eksklusi. Minimal 8 poin untuk menang (Bunga tidak dihitung untuk syarat minimal itu). Bentuk tangan khusus yang didukung: Seven Pairs, Thirteen Orphans, Honors & Knitted, Knitted Straight.
- Pembayaran sesuai panduan:
  - Menang dari buangan: tiap lawan bayar 8, dan pembuang bayar tambahan sebesar poin tangan.
  - Tsumo: tiap lawan bayar (poin + 8).
- 16 tangan (ronde angin Timur sampai Utara), dealer bergilir.
- Bot AI dengan efisiensi tile berbasis shanten dan sedikit kecenderungan ke flush.
- Realtime lewat Server-Sent Events. Bisa reconnect (token disimpan di localStorage).
- Batas waktu: giliran 30 dtk (lewat batas, tile yang baru ditarik otomatis dibuang) dan klaim 12 dtk (otomatis lewati).

## Struktur

| File | Isi |
|---|---|
| `src/tiles.js` | Encoding tile dan pembuatan tembok |
| `src/hand.js` | Dekomposisi tangan, deteksi menang, tile tunggu |
| `src/scoring.js` | 81 fan, eksklusi, pembayaran |
| `src/ai.js` | Shanten dan keputusan bot |
| `src/game.js` | Mesin permainan (state machine, otoritatif di server) |
| `server.js` | HTTP API, SSE, room, file statis |
| `public/` | Klien browser (HTML/CSS/JS murni) |
| `scripts/simulate.js` | Uji ketahanan: `node scripts/simulate.js 20` (bot vs bot, cek invarian jumlah tile dan skor zero-sum) |

## Deploy gratis (tanpa kartu kredit) — Koyeb

Game ini butuh server yang selalu hidup + koneksi realtime (SSE), jadi **tidak cocok** untuk Vercel/Netlify/GitHub Pages. Platform gratis yang **tidak meminta kartu kredit** saat daftar: **Koyeb**. (Render & Railway sering minta kartu untuk verifikasi; Fly.io sudah menghapus free tier-nya.)

Langkah di Koyeb:
1. Daftar di https://www.koyeb.com (bisa pakai akun GitHub, tanpa kartu kredit).
2. **Create Service → GitHub** → pilih repo `dericsen/mahjong`.
3. Builder: **Dockerfile** (otomatis terdeteksi dari `Dockerfile` di repo ini).
4. Port: **3000**. Health check path: `/healthz`.
5. Pilih instance **Free**, klik **Deploy**. Beberapa menit kemudian dapat URL publik `https://<nama>.koyeb.app`.

Repo ini sudah berisi `Dockerfile` + `.dockerignore` + endpoint `/healthz`, dan server membaca `PORT` dari environment, jadi tidak ada konfigurasi tambahan yang perlu diubah.

Alternatif gratis lain: **Google Cloud Run** dan **Oracle Cloud Always Free** (lebih teknis, dan tetap minta kartu untuk verifikasi di sebagian wilayah).

## Penyederhanaan dan catatan

- Semua state disimpan di memori. Kalau server restart, room hilang.
- Kombinasi fan antar-Chow (Pure/Mixed Double Chow, Short Straight, Two Terminal Chows) dihitung dengan pendekatan "tiap Chow dipakai sekali". Dalam kasus tertentu nilainya bisa sedikit di bawah kalkulator MCR resmi.
- Reversible Tiles memakai daftar standar MCR (Bulatan 1234589, Bambu 245689, Naga Putih). Daftar di PDF tampaknya tertukar.
- Penalti salah Mahjong (30 poin) tidak dipakai, karena tombol Mahjong hanya muncul kalau tangan sah dan sudah ≥ 8 poin.
