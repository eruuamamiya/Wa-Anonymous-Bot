const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const { spawn } = require("child_process"); // Gw ubah ke spawn khusus untuk streaming (biar ga nyimpen di STB)
const qrcode = require("qrcode-terminal");
const express = require("express");

const app = express();
app.use(express.json());

const knownUsers = new Set(); 

function extractVideoStream(url, options = []) {
    // -q (quiet) biar log terminal ga penuh, -o - (output ke stdout) biar ga disimpen ke disk STB
    const args = ['-q', ...options, '-o', '-', url];
    const yt = spawn('yt-dlp', args);
    return yt.stdout;
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Windows", "Chrome", "110.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- SCAN QR CODE DI BAWAH INI ---');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log('\n✅ WhatsApp Terhubung! Bot Downloader Mandiri (yt-dlp) siap digunakan.');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`Koneksi terputus. Mencoba menghubungkan kembali: ${shouldReconnect}`);
            if (shouldReconnect) {
                startBot();
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.includes('@g.us')) return;

        const sender = msg.key.remoteJid; 
        const msgType = Object.keys(msg.message)[0];
        
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
        const args = textMessage.trim().split(/\s+/); 
        const cmd = args[0].toLowerCase(); 
        const urlInput = args[1]; 

        if (!knownUsers.has(sender)) {
            knownUsers.add(sender); 
            
            const welcomeMsg = `👋 *Halo! Selamat datang di Bot Downloader NekoGanz!*\n\n` +
                               `Bot ini menggunakan core mandiri (yt-dlp) sehingga terbebas dari limit harian API pihak ketiga.\n\n` +
                               `Ketik */menu* untuk melihat daftar perintah.\n\n` +
                               `Selamat mencoba! 🎉`;

            await sock.sendMessage(sender, { 
                image: { url: 'https://i.ibb.co.com/tMQFng80/wallpapersden-com-himiko-toga-digital-my-hero-academia-1280x720.jpg' }, 
                caption: welcomeMsg 
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
          
            await sock.sendMessage(sender, {
                audio: { url: 'LINK_AUDIO_ATAU_PATH_LOKAL_DISINI.mp3' },
                mimetype: 'audio/mp4',
                ptt: true
            });

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (cmd === '/menu' || cmd === '/start' || cmd === '/info') {
            const totalUsers = knownUsers.size;

            const menuMessage = `🤖 *NekoFlux.BOT* 🤖\n\n` +
                                `📊 *Statistik Bot:*\n` +
                                `👥 Total Pengguna: ${totalUsers} Orang\n\n` +
                                `Download media tanpa limit harian dan tanpa watermark!\n\n` +
                                `📋 *Daftar Perintah Downloader:*\n` +
                                `* 🎬 */tiktok <link>* : Download Video TikTok\n` +
                                `* 📺 */youtube <link>* : Download Video/Shorts YouTube\n` +
                                `* 📸 */instagram <link>* : Download Reels/Post Instagram\n` +
                                `* 📘 */facebook <link>* : Download Video Facebook\n\n` +
                                `📋 *Fitur Kreatif:*\n` +
                                `* 🎨 */sticker* : Buat stiker otomatis (Kirim/Reply Gambar)\n` +
                                `* 📜 */menu* : Menampilkan daftar perintah ini\n\n` +
                                `👨‍💻 *Developer:* NekoGanz\n` +
                                `💡 _Tips: Beri spasi satu kali setelah perintah sebelum memasukkan link._`;
            
            await sock.sendMessage(sender, { text: menuMessage });
            return;
        }
        if (cmd === '/sticker' || cmd === '/s') {
            const isImage = msgType === 'imageMessage';
            const isQuotedImage = msgType === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage?.imageMessage;

            if (isImage || isQuotedImage) {
                await sock.sendMessage(sender, { text: "⏳ Sedang memproses stiker..." });
                try {
                    const mediaMessage = isImage ? msg.message.imageMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                    const stream = await downloadContentFromMessage(mediaMessage, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const sticker = new Sticker(buffer, {
                        pack: 'Media Downloader Bot',
                        author: 'NekoGanz',
                        type: StickerTypes.FULL,
                        quality: 50
                    });
                    await sock.sendMessage(sender, { sticker: await sticker.toBuffer() });
                } catch (error) { 
                    await sock.sendMessage(sender, { text: "❌ Gagal memproses stiker." }); 
                }
            } else {
                await sock.sendMessage(sender, { text: "⚠️ Kirim gambar dengan caption */sticker* atau reply gambar dengan */sticker*" });
            }
            return;
        }
        if (cmd === '/tiktok' || cmd === '/tt') {
            if (!urlInput) return await sock.sendMessage(sender, { text: "⚠️ Masukkan link TikTok!\nContoh: */tiktok <link>*" });
            
            await sock.sendMessage(sender, { text: "⏳ [yt-dlp] Mengekstrak video TikTok..." });
            try {
                const stream = extractVideoStream(urlInput);
                await sock.sendMessage(sender, { 
                    video: { stream: stream }, 
                    caption: `✅ *TikTok Berhasil!*` 
                });
            } catch (error) {
                console.error(error);
                await sock.sendMessage(sender, { text: "❌ Gagal mengambil video TikTok. Pastikan tautan benar." });
            }
            return;
        }
        if (cmd === '/youtube' || cmd === '/yt') {
            if (!urlInput) return await sock.sendMessage(sender, { text: "⚠️ Masukkan link YouTube!\nContoh: */youtube <link>*" });
            
            await sock.sendMessage(sender, { text: "⏳ [yt-dlp] Mengekstrak video/shorts YouTube..." });
            try {
                const stream = extractVideoStream(urlInput, ["-f", "18"]);
                await sock.sendMessage(sender, { 
                    video: { stream: stream }, 
                    caption: `✅ *YouTube Berhasil!*` 
                });
            } catch (error) {
                console.error(error);
                await sock.sendMessage(sender, { text: "❌ Gagal memproses YouTube. Kemungkinan video dilindungi atau durasi terlalu panjang." });
            }
            return;
        }
        if (cmd === '/instagram' || cmd === '/ig') {
            if (!urlInput) return await sock.sendMessage(sender, { text: "⚠️ Masukkan link Instagram!\nContoh: */instagram <link>*" });
            
            await sock.sendMessage(sender, { text: "⏳ [yt-dlp] Mengekstrak media Instagram..." });
            try {
                const stream = extractVideoStream(urlInput);
                await sock.sendMessage(sender, { 
                    video: { stream: stream }, 
                    caption: `✅ *Instagram Berhasil!*` 
                });
            } catch (error) {
                console.error(error);
                await sock.sendMessage(sender, { text: "❌ Gagal memproses Instagram. Pastikan konten dari akun publik." });
            }
            return;
        }
        if (cmd === '/facebook' || cmd === '/fb') {
            if (!urlInput) return await sock.sendMessage(sender, { text: "⚠️ Masukkan link Facebook!\nContoh: */facebook <link>*" });
            
            await sock.sendMessage(sender, { text: "⏳ [yt-dlp] Mengekstrak video Facebook..." });
            try {
                const stream = extractVideoStream(urlInput, ["-f", "\"best[ext=mp4]\""]);
                await sock.sendMessage(sender, { 
                    video: { stream: stream }, 
                    caption: `✅ *Facebook Berhasil!*` 
                });
            } catch (error) {
                console.error(error);
                await sock.sendMessage(sender, { text: "❌ Gagal memproses video Facebook." });
            }
            return;
        }
        if (!cmd.startsWith('/')) {
            await sock.sendMessage(sender, { text: "🤖 Halo! Silakan kirim perintah downloader kamu atau ketik */menu* untuk melihat panduan." });
        }
    });
}

startBot();
