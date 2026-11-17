// XSSENCE LIBERIA - BACKEND API
// Run: npm install then npm start -> http://localhost:5000
// Values: WhatsApp +231778566814, Orange Money 0778 455 814, Delivery Monrovia $3-$5 / Outside $15-$30

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'xssence-liberia-secret-2026-change-this';
const OTP_TEST_CODE = '123456'; // In production, replace with Twilio / WhatsApp API

app.use(cors());
app.use(express.json());

// ===== DATA STORAGE - JSON FILES (No DB needed) =====
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, fallback) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) { fs.writeFileSync(p, JSON.stringify(fallback, null, 2)); return fallback; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}
const getUsers = () => readJSON('users.json', []);
const saveUsers = (u) => writeJSON('users.json', u);
const getOrders = () => readJSON('orders.json', []);
const saveOrders = (o) => writeJSON('orders.json', o);
const getWishlists = () => readJSON('wishlists.json', {});
const saveWishlists = (w) => writeJSON('wishlists.json', w);

// OTP store in memory: { phone: { code, expiresAt } }
const otpStore = {};

// ===== PRODUCTS - SAME AS FRONTEND =====
const PRODUCTS = [
  { id: 1, name: "XSSENCE Hoodie", cat: "hoodie", price: 35, old: 40, img: "hoodie-front.jpg", colors: "Black, White, Grey, Olive, Mocha, Navy", sizes: "S,M,L,XL,XXL" },
  { id: 9, name: "Dodgers Freeman #5 Jersey", cat: "tee", price: 35, old: 45, img: "dodgers-front.jpg", colors: "White", sizes: "S,M,L,XL,XXL" },
  { id: 10, name: "Brown Graffiti Crewneck", cat: "long-sleeve", price: 35, old: 45, img: "graffiti-brown-front.jpg", colors: "Brown, Mocha", sizes: "S,M,L,XL,XXL" },
  { id: 11, name: "Blue Adidas Hoodie", cat: "hoodie", price: 35, old: 45, img: "adidas-blue-front.jpg", colors: "Blue", sizes: "S,M,L,XL,XXL" },
  { id: 12, name: "White Polo Splash Hoodie", cat: "hoodie", price: 35, old: 45, img: "polo-white-front.jpg", colors: "White", sizes: "S,M,L,XL,XXL" },
  { id: 2, name: "XSSENCE Tee", cat: "tee", price: 20, old: 35, img: "tee-front.jpg", colors: "Black, White, Grey, Olive, Mocha, Navy", sizes: "S,M,L,XL,XXL" },
  { id: 3, name: "XSSENCE Joggers", cat: "joggers", price: 30, old: 40, img: "joggers-front.jpg", colors: "Black, White, Grey, Olive, Mocha, Navy", sizes: "S,M,L,XL,XXL" },
  { id: 4, name: "Long Sleeve Shirt", cat: "long-sleeve", price: 30, old: 35, img: "long-sleeve-front.jpg", colors: "Black, White, Grey, Navy", sizes: "S,M,L,XL,XXL" },
  { id: 5, name: "XSSENCE Underwear (3 Pack)", cat: "underwear", price: 15, old: 20, img: "underwear-front.jpg", colors: "Black, White, Grey", sizes: "S,M,L,XL,XXL" },
  { id: 6, name: "XSSENCE Shorts", cat: "shorts", price: 20, old: 25, img: "shorts-front.jpg", colors: "Black, Grey, Olive", sizes: "S,M,L,XL,XXL" },
  { id: 7, name: "XSSENCE Cap", cat: "cap", price: 12, old: 18, img: "cap-front.jpg", colors: "Black, White, Olive", sizes: "One Size" },
  { id: 8, name: "Full Set - Hoodie + Tee + Joggers", cat: "set", price: 75, old: 85, img: "hoodie-front.jpg", colors: "Black, White, Grey, Olive, Mocha, Navy", sizes: "S,M,L,XL,XXL" },
];

// ===== HELPERS =====
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, county: u.county, address: u.address, landmark: u.landmark, lat: u.lat, lng: u.lng, createdAt: u.createdAt };
}
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
}
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token - Please login' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = getUsers();
    const user = users.find(u => u.id === decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token - Please login again' });
  }
}

// ===== HEALTH =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'XSSENCE Backend Running', whatsapp: '+231778566814', orangeMoney: '0778 455 814', products: PRODUCTS.length });
});
app.get('/api/products', (req, res) => res.json({ products: PRODUCTS }));

// ===== AUTH - SIGNUP =====
// POST /api/auth/signup { name, email, phone, password, county, address, landmark, lat, lng }
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, phone, password, county, address, landmark, lat, lng } = req.body;
  if (!name || !email || !phone || !password || !address) return res.status(400).json({ error: 'Please fill Name, Email, Phone, Password & Address' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const users = getUsers();
  if (users.find(u => u.email === email.toLowerCase())) return res.status(400).json({ error: 'Account already exists with this email. Please Login.' });
  if (users.find(u => u.phone === phone)) return res.status(400).json({ error: 'Account already exists with this phone. Please Login.' });
  const hashed = await bcrypt.hash(password, 10);
  const newUser = {
    id: 'user_' + Date.now(),
    name: name.trim(), email: email.toLowerCase().trim(), phone: phone.trim(),
    password: hashed, county: county || 'Monrovia', address: address.trim(), landmark: landmark || '',
    lat: lat || null, lng: lng || null, createdAt: new Date().toISOString()
  };
  users.push(newUser); saveUsers(users);
  const token = signToken(newUser);
  res.json({ success: true, token, user: publicUser(newUser) });
});

// ===== AUTH - LOGIN / SIGNIN =====
// POST /api/auth/login { emailOrPhone, password }
app.post('/api/auth/login', async (req, res) => {
  const { emailOrPhone, password } = req.body;
  if (!emailOrPhone || !password) return res.status(400).json({ error: 'Enter Email/Phone + Password' });
  const users = getUsers();
  const user = users.find(u => u.email === emailOrPhone.toLowerCase() || u.phone === emailOrPhone);
  if (!user) return res.status(400).json({ error: 'No account found. Please Signup first.' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Wrong password' });
  const token = signToken(user);
  res.json({ success: true, token, user: publicUser(user) });
});

// ===== AUTH - LOGOUT / SIGNOUT =====
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

// ===== AUTH - ME =====
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ===== OTP - SEND =====
// POST /api/auth/send-otp { phone } -> returns code in TEST MODE. In production, send via Twilio/WhatsApp and DON'T return code.
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  const code = OTP_TEST_CODE; // TODO: Replace with real SMS: Math.floor(100000 + Math.random()*900000).toString()
  otpStore[phone] = { code, expiresAt: Date.now() + 5 * 60 * 1000 };
  console.log(`[OTP] Phone: ${phone} Code: ${code} - Send via WhatsApp/SMS in production`);
  // TODO PRODUCTION: Call Twilio / WhatsApp API here
  // Example: await twilioClient.messages.create({ to: '+231'+phone, from: 'XSSENCE', body: `Your XSSENCE code is ${code}` })
  res.json({ success: true, message: 'OTP sent to ' + phone, code }); // Remove `code` in production!
});

// ===== OTP - VERIFY =====
// POST /api/auth/verify-otp { phone, code }
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, code } = req.body;
  const entry = otpStore[phone];
  if (!entry) {
    // Allow test code even if not sent, for demo
    if (code === OTP_TEST_CODE) return res.json({ success: true, verified: true, message: 'Phone verified (test mode)' });
    return res.status(400).json({ error: 'No OTP sent. Please tap Send OTP first.' });
  }
  if (Date.now() > entry.expiresAt) return res.status(400).json({ error: 'OTP expired. Please resend.' });
  if (code !== entry.code) return res.status(400).json({ error: 'Wrong code' });
  delete otpStore[phone];
  res.json({ success: true, verified: true, message: 'Phone verified' });
});

// ===== LOCATION - SAVE =====
// POST /api/location/save { county, address, email, phone, lat, lng } - Auth required
app.post('/api/location/save', authMiddleware, (req, res) => {
  const { county, address, email, phone, lat, lng } = req.body;
  const users = getUsers();
  const idx = users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  if (county) users[idx].county = county;
  if (address) users[idx].address = address;
  if (email) users[idx].email = email;
  if (phone) users[idx].phone = phone;
  if (lat !== undefined) users[idx].lat = lat;
  if (lng !== undefined) users[idx].lng = lng;
  saveUsers(users);
  res.json({ success: true, user: publicUser(users[idx]) });
});

// ===== WISHLIST =====
// GET /api/wishlist - Auth required
app.get('/api/wishlist', authMiddleware, (req, res) => {
  const all = getWishlists();
  const list = all[req.user.id] || [];
  const products = list.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  res.json({ wishlist: list, products });
});
// POST /api/wishlist/add { productId }
app.post('/api/wishlist/add', authMiddleware, (req, res) => {
  const { productId } = req.body;
  if (!PRODUCTS.find(p => p.id === productId)) return res.status(404).json({ error: 'Product not found' });
  const all = getWishlists();
  if (!all[req.user.id]) all[req.user.id] = [];
  if (!all[req.user.id].includes(productId)) all[req.user.id].push(productId);
  saveWishlists(all);
  res.json({ success: true, wishlist: all[req.user.id] });
});
// POST /api/wishlist/remove { productId }
app.post('/api/wishlist/remove', authMiddleware, (req, res) => {
  const { productId } = req.body;
  const all = getWishlists();
  if (all[req.user.id]) all[req.user.id] = all[req.user.id].filter(id => id !== productId);
  saveWishlists(all);
  res.json({ success: true, wishlist: all[req.user.id] || [] });
});

// ===== ORDERS =====
// POST /api/orders { items, total, name, phone, email, county, address, payment } - Guest allowed, Auth optional
app.post('/api/orders', (req, res) => {
  const { items, total, name, phone, email, county, address, payment } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });
  if (!name || !phone || !address) return res.status(400).json({ error: 'Name, Phone & Address required' });
  // Try to get user if token present
  let userId = null;
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (token) { try { const d = jwt.verify(token, JWT_SECRET); userId = d.id; } catch {} }
  const orders = getOrders();
  const order = {
    id: 'XSS-' + Date.now(),
    userId, items, total, name, phone, email: email || '', county: county || 'Monrovia', address,
    payment: payment || 'Orange Money — 0778 455 814',
    status: 'pending', createdAt: new Date().toISOString(),
    whatsappMessage: `Hi XSSENCE - NEW ORDER\n${items.map(i => `${i.name} x${i.qty} = $${i.price * i.qty}`).join('\n')}\nName: ${name}\nPhone: ${phone}\nDelivery: ${county}\nAddress: ${address}\nTotal: $${total}`
  };
  orders.push(order); saveOrders(orders);
  console.log(`[NEW ORDER] ${order.id} - ${name} - $${total} - ${phone}`);
  res.json({ success: true, orderId: order.id, order });
});
// GET /api/orders/my-orders - Auth required
app.get('/api/orders/my-orders', authMiddleware, (req, res) => {
  const orders = getOrders().filter(o => o.userId === req.user.id || o.phone === req.user.phone);
  res.json({ orders });
});
// GET /api/orders/all - Admin / Seller view (protect this in production!)
app.get('/api/orders/all', (req, res) => {
  const orders = getOrders();
  res.json({ totalOrders: orders.length, totalRevenue: orders.reduce((a, o) => a + (o.total || 0), 0), orders: orders.reverse() });
});

// ===== WISHLIST WHATSAPP TEMPLATES =====
app.get('/api/whatsapp/wishlist-reminder', (req, res) => {
  const { name, productName, price } = req.query;
  const msg = `Hi ${name || 'there'} 👋 This is XSSENCE Liberia ❤️\nYou saved ${productName || 'an item'} - $${price || '35'} to your Wishlist but didn't order yet.\nStill want it? Stock is limited 🔥\nReply YES and I'll hold it for you.\nOrange Money: 0778 455 814`;
  res.json({ template: msg, whatsappLink: `https://wa.me/231778566814?text=${encodeURIComponent(msg)}` });
});
app.get('/api/whatsapp/abandoned-cart', (req, res) => {
  const { name, productName, price } = req.query;
  const msg = `Hi ${name || 'there'} 👋 XSSENCE here.\nYou left ${productName || 'an item'} - $${price || '35'} in your cart 🛒\nWant me to hold it for you? Delivery Monrovia $3-$5.\nReply YES to complete your order.`;
  res.json({ template: msg, whatsappLink: `https://wa.me/231778566814?text=${encodeURIComponent(msg)}` });
});

app.listen(PORT, () => {
  console.log(`✅ XSSENCE Backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Products: http://localhost:${PORT}/api/products`);
  console.log(`   Orders (seller): http://localhost:${PORT}/api/orders/all`);
});