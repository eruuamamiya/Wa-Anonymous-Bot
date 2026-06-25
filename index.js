const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// FIX 1: Deklarasi variabel antrean chat anonim secara global
let searchQueue = [];
const activeSessions = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // FIX 2: Matikan bawaan Baileys agar tidak double QR
        browser: ["Windows", "Chrome", "110.0.0"] // FIX 4: Gunakan identitas browser standar biar aman
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Render QR manual yang stabil di terminal
        if (qr) {
            console.log('--- SCAN QR CODE DI BAWAH INI ---');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log('\n✅ WhatsApp Terhubung! Bot Anonymous siap digunakan.');
        }
        
        if (connection === 'close') {
            // FIX 3: Gunakan ?. agar tidak crash jika lastDisconnect kosong
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`Koneksi terputus karena: ${lastDisconnect?.error}. Mencoba menghubungkan kembali: ${shouldReconnect}`);
            if (shouldReconnect) {
                startBot();
            }
        }
    });

    // Menangani pesan masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.includes('@g.us')) return;

        const sender = msg.key.remoteJid; 
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
        const command = textMessage.toLowerCase().trim();

        // 1. Perintah Cari Pasangan
        if (command === '/search' || command === '/start') {
            if (activeSessions[sender]) {
                await sock.sendMessage(sender, { text: "⚠️ Kamu masih dalam obrolan aktif. Ketik /stop untuk keluar dulu." });
                return;
            }
            if (searchQueue.includes(sender)) {
                await sock.sendMessage(sender, { text: "⏳ Kamu sudah ada di antrean. Menunggu pasangan..." });
                return;
            }

            if (searchQueue.length > 0) {
                const partner = searchQueue.shift(); 
                activeSessions[sender] = partner;
                activeSessions[partner] = sender;
                await sock.sendMessage(sender, { text: "✅ Pasangan ditemukan! Mulai mengobrol sekarang. (Ketik /stop untuk mengakhiri)" });
                await sock.sendMessage(partner, { text: "✅ Pasangan ditemukan! Mulai mengobrol sekarang. (Ketik /stop untuk mengakhiri)" });
                return;
            } else {
                searchQueue.push(sender);
                await sock.sendMessage(sender, { text: "🔍 Mencari pasangan... Silakan tunggu." });
                return;
            }
        }

        // 2. Perintah Berhenti Chat
        if (command === '/stop' || command === '/next') {
            if (searchQueue.includes(sender)) {
                searchQueue = searchQueue.filter(id => id !== sender);
                await sock.sendMessage(sender, { text: "❌ Pencarian dihentikan." });
                return;
            }
            const partner = activeSessions[sender];
            if (partner) {
                delete activeSessions[sender];
                delete activeSessions[partner];
                await sock.sendMessage(sender, { text: "🛑 Obrolan dihentikan." });
                await sock.sendMessage(partner, { text: "🛑 Pasanganmu telah meninggalkan obrolan." });
                if (command === '/next') {
                     searchQueue.push(sender);
                     await sock.sendMessage(sender, { text: "🔍 Mencari pasangan baru... Silakan tunggu." });
                }
                return;
            }
            await sock.sendMessage(sender, { text: "Kamu tidak sedang mengobrol. Ketik /search untuk mencari teman." });
            return;
        }

        // 3. Meneruskan Pesan
        const partner = activeSessions[sender];
        if (partner && !command.startsWith('/')) {
            try {
                // Meneruskan pesan secara anonim
                await sock.sendMessage(partner, { forward: msg });
            } catch (error) {
                console.error("Gagal meneruskan pesan:", error);
            }
            return;
        }

        // 4. Default
        if (!partner && !command.startsWith('/')) {
            await sock.sendMessage(sender, { text: "Halo! Ketik /search untuk mulai mengobrol secara anonim." });
        }
    });
}

// Menjalankan bot
startBot();

// Catatan: Express dideklarasikan tapi belum di-listen. 
// Jika butuh port monitoring (misal untuk Replit/Koyeb), tambahkan app.listen(3000) di bawah sini.
