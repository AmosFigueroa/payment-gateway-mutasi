import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

const UserSchema = new mongoose.Schema({
  store_name: String,
  email: { type: String, unique: true, required: true },
  wa: String,
  pin: String,
  balance: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, pin, store, wa } = req.body;

  try {
    if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGODB_URI);

    // --- PEMBERSIH EMAIL (PENTING!) ---
    // Ubah jadi huruf kecil semua & hapus spasi di depan/belakang
    const cleanEmail = email ? email.toLowerCase().trim() : "";

    // A. REGISTER
    if (action === 'register') {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) return res.status(400).json({ error: 'Email sudah terdaftar!' });

      const newUser = new User({ store_name: store, email: cleanEmail, wa, pin, balance: 0 });
      await newUser.save();

      return res.status(200).json({ status: 'success' });
    }

    // B. LOGIN
    else if (action === 'login') {
      // Cari user dengan email bersih & pin yang tepat
      const user = await User.findOne({ email: cleanEmail, pin: pin });
      
      if (!user) return res.status(401).json({ error: 'Email atau PIN salah!' });

      return res.status(200).json({
        status: 'success',
        data: {
          store: user.store_name,
          email: user.email,
          wa: user.wa,
          balance: user.balance
        }
      });
    }

    // C. CEK SALDO
    else if (action === 'check_balance') {
      const user = await User.findOne({ email: cleanEmail });
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json({ balance: user.balance });
    }

    return res.status(400).json({ error: 'Action unknown' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
