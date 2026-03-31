import mongoose from "mongoose";
const MONGODB_URI = process.env.MONGODB_URI;

const Order =
  mongoose.models.Order ||
  mongoose.model(
    "Order",
    new mongoose.Schema({
      order_id: String,
      status: String,
      product_name: String,
    }),
  );

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const { order_id } = req.query;
  try {
    if (mongoose.connection.readyState !== 1)
      await mongoose.connect(MONGODB_URI);
    const order = await Order.findOne({ order_id }, "status product_name");
    if (!order) return res.status(404).json({ status: "NOT_FOUND" });
    return res
      .status(200)
      .json({ status: order.status, product_name: order.product_name });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
