# 🕵️‍♂️ WhatsApp Anonymous Chat Bot
Sebuah script Bot WhatsApp sederhana namun tangguh yang memungkinkan pengguna untuk melakukan obrolan secara anonim (Anonymous Chat) layaknya fitur *random chat* di Telegram. Dibangun menggunakan Node.js dan library `@whiskeysockets/baileys`.
🔥 **Coba Langsung Bot-nya di Sini:**
👉 **[Mulai Obrolan Anonim Sekarang!](https://wa.me/6285608637146?text=/start)**
---
## ✨ Fitur Utama
- **Pencarian Cepat:** Sistem antrean (*queue*) yang efisien untuk mempertemukan dua pengguna secara acak.
- **Privasi Terjaga:** Identitas (nomor WhatsApp) masing-masing pengguna sepenuhnya disembunyikan.
- **Dukungan Media:** Bisa meneruskan pesan teks, gambar, video, dan *sticker* antar pengguna.
- **Sangat Ringan:** Sangat optimal untuk dijalankan di *server* mini seperti STB (Set Top Box) ber-OS Armbian atau VPS skala kecil.
---
## 🛠️ Perintah Bot (Commands)
Daftar perintah yang bisa digunakan oleh pengguna saat mengirim pesan ke bot:

| Perintah | Deskripsi |
| :--- | :--- |
| `/start` atau `/search` | Mulai mencari pasangan obrolan secara acak. |
| `/next` | Mengakhiri obrolan saat ini dan langsung mencari pasangan baru. |
| `/stop` | Mengakhiri obrolan dan keluar dari sesi anonim. |

---
## 🚀 Panduan Instalasi (Untuk Developer)
Jika kamu ingin melakukan *clone* dan menjalankan bot ini di *server* atau STB kamu sendiri, ikuti langkah berikut:
### 1. Persyaratan Sistem
* **Node.js** (Minimal versi 16.x)
* **Git**
* Koneksi internet yang stabil (sangat disarankan untuk *pairing* awal menggunakan data seluler jika IP ISP terblokir WhatsApp).
### 2. Instalasi
```bash
# Clone repository ini
git clone [https://github.com/eruuamamiya/Wa-Anonymous-Bot.git](https://github.com/eruuamamiya/Wa-Anonymous-Bot.git)
# Masuk ke direktori bot
cd Wa-Anonymous-Bot
# Install semua library yang dibutuhkan
npm install
