export default async function handler(req, res) {
    // Hanya menerima akses via Browser (GET)
    if (req.method !== 'GET') return res.status(405).send("Method Not Allowed");

    const { data } = req.query; // Ambil data rahasia dari link
    const gasUrl = process.env.GAS_EMAIL_URL;

    if (!data || !gasUrl) return res.status(400).send("Data Invalid atau Config Belum Ada");

    try {
        // 1. Pecahkan Data (Decode Base64)
        const jsonStr = Buffer.from(data, 'base64').toString('utf-8');
        const wdData = JSON.parse(jsonStr);

        // 2. Perintah ke Google Script: "Kirim Email Sukses!"
        await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                type: 'WITHDRAW_SUCCESS', // Kode perintah khusus
                data: wdData 
            })
        });

        // 3. Tampilkan Layar Sukses ke Admin
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(`
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Konfirmasi Sukses</title>
                <style>
                    body { background: #0f172a; color: white; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; margin: 0; }
                    .box { background: #1e293b; padding: 30px; border-radius: 20px; border: 1px solid #334155; max-width: 90%; }
                    h1 { color: #10b981; margin-bottom: 10px; }
                    .btn { display: inline-block; margin-top: 20px; padding: 12px 25px; background: #334155; color: white; text-decoration: none; border-radius: 10px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h1>✅ Berhasil Dikonfirmasi!</h1>
                    <p>Sistem telah mengirim email notifikasi<br>ke <b>${wdData.store}</b>.</p>
                    <br>
                    <a href="javascript:window.close()" class="btn">Tutup Jendela</a>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        return res.status(500).send("Gagal: " + error.message);
    }
}
