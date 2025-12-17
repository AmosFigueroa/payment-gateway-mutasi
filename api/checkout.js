import mongoose from 'mongoose';
import QRCode from 'qrcode';

// Ambil Link Database dari Vercel
const MONGODB_URI = process.env.MONGODB_URI;

// Format Data Pesanan
const OrderSchema = new mongoose.Schema({
  order_id: String,
  product_name: String,
  customer_contact: String,
  amount_original: Number,
  unique_code: Number,
  total_pay: Number,
  status: { type: String, default: 'UNPAID' },
  qris_string: String, // Simpan string QRIS untuk referensi
  created_at: { type: Date, default: Date.now }
});

// Cek agar model tidak dobel saat reload
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

// --- Fungsi Helper CRC16 (Wajib ada untuk QRIS) ---
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
  }
  let hex = (crc & 0xFFFF).toString(16).toUpperCase();
  return hex.padStart(4, '0');
}

function convertToDynamic(qrisRaw, amount) {
  let amountStr = amount.toString();
  let tag54 = "54" + amountStr.length.toString().padStart(2, '0') + amountStr;
  let cleanQris = qrisRaw.substring(0, qrisRaw.length - 4);
  let splitIndex = cleanQris.lastIndexOf("6304");
  if (splitIndex === -1) return qrisRaw;
  let beforeCRC = cleanQris.substring(0, splitIndex);
  let newString = beforeCRC + tag54 + "6304";
  return newString + crc16(newString);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // -----------------------------------------------------------
  // PENTING: GANTI STRING DI BAWAH INI DENGAN QRIS ASLI KAMU!
  const MY_QRIS = "00020101021126610014COM.GO-JEK.WWW01189360091438225844470210G8225844470303UMI51440014ID.CO.QRIS.WWW0215ID10243639137310303UMI5204721053033605802ID5925WAGO SHOESPA CUCI SEPATU 6006SLEMAN61055529462070703A016304EFA8"; 
  // -----------------------------------------------------------

  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI);
    }

    const { product_name, price, customer_contact } = req.body;

    // 1. Hitung Kode Unik (3 digit 100-999)
    const uniqueCode = Math.floor(Math.random() * 899) + 100;
    const totalPay = parseInt(price) + uniqueCode;

    // 2. Generate QRIS Dinamis
    const dynamicQris = convertToDynamic(MY_QRIS, totalPay);
    
    // 3. Ubah jadi Gambar
    const qrImage = await QRCode.toDataURL(dynamicQris);

    // 4. Simpan Order ke Database
    const newOrder = await Order.create({
      order_id: "ORD-" + Date.now(),
      product_name: product_name,
      customer_contact: customer_contact,
      amount_original: price,
      unique_code: uniqueCode,
      total_pay: totalPay,
      status: 'UNPAID',
      qris_string: dynamicQris
    });

    return res.status(200).json({
      status: 'success',
      order_id: newOrder.order_id,
      total_pay: totalPay,
      qr_image: qrImage,
      expired_in: "Segera bayar sebelum kode unik hangus"
    });

  } catch (error) {
    console.error("Checkout Error:", error);
    return res.status(500).json({ error: 'Gagal membuat tagihan' });
  }
}
