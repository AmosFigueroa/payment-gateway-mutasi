export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).send("Method Not Allowed");

    const { data } = req.query; // Ambil data terenkripsi dari Link
    const gasUrl = process.env.GAS_EMAIL_URL;

    if (!data || !gasUrl) return res.status(400).send("Invalid Link or Config");

    try {
        // 1. Decode Data (Base64 -> JSON)
        const jsonStr = Buffer.from(data, 'base64').toString('utf-8');
        const withdrawData = JSON.parse(jsonStr);

        // 2. Panggil Google Script untuk Kirim Email ke User
        await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                type: 'WITHDRAW_SUCCESS', 
                data: withdrawData 
            })
        });

        // 3. Tampilkan Halaman Sukses ke Admin
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(`
            <html>
            <head>
                <title>Sukses</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: sans-serif; background: #0f172a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
                    .card { background: #1e293b; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 90%; }
                    h1 { color: #34d399; margin-bottom: 10px; }
                    p { color: #94a3b8; }
                    .btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #334155; color: white; text-decoration: none; border-radius: 10px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ Berhasil!</h1>
                    <p>Status pencairan <b>${withdrawData.store}</b> telah diupdate.</p>
                    <p>Email notifikasi "Sukses Cair" telah dikirim ke user.</p>
                    <a href="javascript:window.close()" class="btn">Tutup Window</a>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        return res.status(500).send("Terjadi Kesalahan: " + error.message);
    }
}
