const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const express = require("express");
const axios = require("axios");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

const app = express();
app.use(express.json());

// STRUKTUR DATA
let searchQueue = []; // Berisi: { id: sender, myGender: 'cowok'/'cewek'/'belum diatur', lookingFor: 'cowok'/'cewek'/'random' }
const activeSessions = {};
const userProfiles = {}; // Format: { 'nomorWA': 'cowok' }
const knownUsers = new Set(); // BUKU TAMU: Untuk mencatat user yang sudah pernah chat bot

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
            console.log('\n✅ WhatsApp Terhubung! Bot Anonymous NekoGanz siap digunakan.');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`Koneksi terputus karena: ${lastDisconnect?.error}. Mencoba menghubungkan kembali: ${shouldReconnect}`);
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
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
        const command = textMessage.toLowerCase().trim();
        const args = command.split(' ');
        const cmd = args[0]; 

        // ==========================================
        // FITUR WELCOME MESSAGE (PESAN PERTAMA KALI)
        // ==========================================
        if (!knownUsers.has(sender)) {
            knownUsers.add(sender); 
            
            const welcomeMsg = `👋 *Halo! Selamat datang di Bot Anonymous by NekoGanz!*\n\n` +
                               `Di sini kamu bisa mencari teman ngobrol baru secara rahasia dan aman.\n\n` +
                               `Ketik */menu* untuk melihat cara menggunakannya, atau langsung ketik */search* untuk mulai mencari teman ngobrol acak.\n\n` +
                               `Selamat bersenang-senang! 🎉`;
                               
            await sock.sendMessage(sender, { text: welcomeMsg });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        // ==========================================

        // 1. Perintah Menu / Info Bot
        if (cmd === '/menu' || cmd === '/start' || cmd === '/info') {
            const infoMessage = `🤖 *INFORMASI BOT ANONYMOUS* 🤖\n\n` +
                                `Ngobrol santai tanpa identitas! Bebas pilih mau chat random atau spesifik.\n\n` +
                                `📋 *Daftar Command:*\n` +
                                `* */search* : Cari pasangan secara acak.\n` +
                                `* */search-man* : Khusus mencari cowok.\n` +
                                `* */search-woman* : Khusus mencari cewek.\n` +
                                `* */next* : Skip dan cari acak.\n` +
                                `* */next-man* / */next-woman* : Skip dan cari spesifik.\n` +
                                `* */setgender <cowok/cewek>* : Atur gendermu agar mudah ditemukan.\n` +
                                `* */sticker* atau */s* : Buat stiker dari gambar (kirim/reply gambar).\n` +
                                `* */stop* : Hentikan obrolan atau pencarian.\n` +
                                `* */menu* : Menampilkan pesan ini.\n\n` +
                                `👨‍💻 *Informasi Developer:*\n` +
                                `Dikembangkan oleh: *NekoGanz*\n` +
                                `Hubungi: +6281287892264\n\n` +
                                `💡 _Tips: Jaga privasi dan selalu sopan ya!_`;
            
            await sock.sendMessage(sender, { 
                image: { url: 'https://i.ibb.co.com/tMQFng80/wallpapersden-com-himiko-toga-digital-my-hero-academia-1280x720.jpg' }, 
                caption: infoMessage 
            });
            return;
        }

        // 2. Perintah Set Profil / Gender
        if (cmd === '/setgender') {
            const gender = args[1];
            if (gender === 'cowok' || gender === 'cewek') {
                userProfiles[sender] = gender;
                await sock.sendMessage(sender, { text: `✅ Gender kamu berhasil diatur sebagai *${gender}*.\nSekarang kamu lebih mudah ditemukan oleh orang yang mencari spesifik gendermu.` });
            } else {
                await sock.sendMessage(sender, { text: "⚠️ Format salah! Ketik: */setgender cowok* atau */setgender cewek*" });
            }
            return;
        }

        // 3. Perintah Cari Pasangan
        const searchCommands = ['/search', '/next', '/search-man', '/search-woman', '/next-man', '/next-woman'];
        if (searchCommands.includes(cmd)) {
            
            if (cmd.startsWith('/next')) {
                const currentPartner = activeSessions[sender];
                if (currentPartner) {
                    delete activeSessions[sender];
                    delete activeSessions[currentPartner];
                    await sock.sendMessage(currentPartner, { text: "🛑 Pasanganmu telah meninggalkan obrolan." });
                }
            }

            if (activeSessions[sender]) {
                await sock.sendMessage(sender, { text: "⚠️ Kamu masih dalam obrolan aktif. Ketik /stop untuk keluar dulu." });
                return;
            }
            if (searchQueue.some(user => user.id === sender)) {
                await sock.sendMessage(sender, { text: "⏳ Kamu sudah ada di antrean. Menunggu pasangan..." });
                return;
            }

            const myGender = userProfiles[sender] || 'belum diatur';
            
            let lookingFor = 'random';
            if (cmd === '/search-man' || cmd === '/next-man') lookingFor = 'cowok';
            if (cmd === '/search-woman' || cmd === '/next-woman') lookingFor = 'cewek';

            let matchIndex = -1;
            for (let i = 0; i < searchQueue.length; i++) {
                const potentialPartner = searchQueue[i];

                const matchMyCriteria = (lookingFor === 'random' || potentialPartner.myGender === lookingFor);
                const matchTheirCriteria = (potentialPartner.lookingFor === 'random' || myGender === potentialPartner.lookingFor);

                if (matchMyCriteria && matchTheirCriteria) {
                    matchIndex = i;
                    break;
                }
            }
            
            if (matchIndex !== -1) {
                const partner = searchQueue.splice(matchIndex, 1)[0]; 
                activeSessions[sender] = partner.id;
                activeSessions[partner.id] = sender;

                const partnerGenderText = (partner.myGender === 'cowok' || partner.myGender === 'cewek') ? partner.myGender : 'belum diatur';
                const myGenderText = (myGender === 'cowok' || myGender === 'cewek') ? myGender : 'belum diatur';

                let senderTitle = `✅ Partner ditemukan! Anda bisa mulai mengobrol.`;
                if (lookingFor !== 'random') {
                    senderTitle = `✅ Partner (*${partnerGenderText}*) ditemukan! Anda bisa mulai mengobrol.`;
                }

                let partnerTitle = `✅ Partner ditemukan! Anda bisa mulai mengobrol.`;
                if (partner.lookingFor !== 'random') {
                    partnerTitle = `✅ Partner (*${myGenderText}*) ditemukan! Anda bisa mulai mengobrol.`;
                }

                const footerMenu = `\n\n/next – partner berikutnya\n/stop – akhiri chat\n\nhttps://wa.me/6285608637146`;

                const connectMsgSender = senderTitle + footerMenu;
                const connectMsgPartner = partnerTitle + footerMenu;

                await sock.sendMessage(sender, { text: connectMsgSender });
                await sock.sendMessage(partner.id, { text: connectMsgPartner });
                return;
            } else {
                searchQueue.push({ id: sender, myGender: myGender, lookingFor: lookingFor });
                
                const searchMsg = lookingFor === 'random' ? "🔍 Mencari pasangan secara acak..." : `🔍 Mencari pasangan (*${lookingFor}*)...`;
                await sock.sendMessage(sender, { text: searchMsg + " Silakan tunggu." });
                return;
            }
        }

        // 4. Perintah Berhenti Chat
        if (cmd === '/stop') {
            if (searchQueue.some(user => user.id === sender)) {
                searchQueue = searchQueue.filter(user => user.id !== sender);
                await sock.sendMessage(sender, { text: "❌ Pencarian dihentikan." });
                return;
            }
            const partner = activeSessions[sender];
            if (partner) {
                delete activeSessions[sender];
                delete activeSessions[partner];
                await sock.sendMessage(sender, { text: "🛑 Obrolan dihentikan." });
                await sock.sendMessage(partner, { text: "Pasanganmu telah menghentikan obrolan 😞\nKetik /search untuk menemukan pasangan baru." });
                return;
            }
            await sock.sendMessage(sender, { text: "Kamu tidak sedang mengobrol. Ketik /search untuk mencari teman." });
            return;
        }

        // ==========================================
        // 5. FITUR STIKER WA
        // ==========================================
        if (cmd === '/sticker' || cmd === '/s') {
            try {
                // Mengecek apakah gambar dikirim langsung atau dari pesan yang di-reply
                const isQuotedImage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
                const imageMessage = msg.message.imageMessage || isQuotedImage;

                if (imageMessage) {
                    await sock.sendMessage(sender, { text: "⏳ Sedang memproses stiker..." }, { quoted: msg });

                    // Mendownload media
                    const stream = await downloadContentFromMessage(imageMessage, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    // Mengonversi buffer gambar ke format WebP (Stiker)
                    const sticker = new Sticker(buffer, {
                        pack: 'Anonymous Bot', 
                        author: 'NekoGanz',    
                        type: StickerTypes.FULL, 
                        quality: 70
                    });

                    const stickerBuffer = await sticker.toBuffer();

                    // Mengirimkan stiker ke user
                    await sock.sendMessage(sender, { sticker: stickerBuffer }, { quoted: msg });
                } else {
                    await sock.sendMessage(sender, { text: "⚠️ Kirim gambar dengan caption */sticker* atau reply sebuah gambar dengan */sticker*" }, { quoted: msg });
                }
            } catch (error) {
                console.error("Error membuat stiker:", error);
                await sock.sendMessage(sender, { text: "❌ Gagal membuat stiker, pastikan file berupa gambar." }, { quoted: msg });
            }
            return; 
        }

        // 6. Meneruskan Pesan (Forwarding)
        const partner = activeSessions[sender];
        if (partner && !cmd.startsWith('/')) {
            try {
                await sock.sendMessage(partner, { forward: msg });
            } catch (error) {
                console.error("Gagal meneruskan pesan:", error);
            }
            return;
        }

        // 7. Default (Jika belum masuk chat dan ketik sembarangan)
        if (!partner && !cmd.startsWith('/')) {
            await sock.sendMessage(sender, { text: "Ketik */search* untuk ngobrol, atau ketik */menu* untuk bantuan." });
        }
    });
}

startBot();
