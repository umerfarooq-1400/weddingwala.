const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Vercel-compatible writable uploads folder (/tmp)
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Static directory serving
app.use(express.static(path.join(__dirname, '../')));

// Schemas
const venueSchema = new mongoose.Schema({
  name: String,
  location: String,
  capacity: Number,
  pricePerHead: Number,
  contactNumber: String,
  imageUrl: String,
  isAvailable: { type: Boolean, default: true }
});
const Venue = mongoose.models.Venue || mongoose.model('Venue', venueSchema);

const bookingSchema = new mongoose.Schema({
  venueId: String,
  venueName: String,
  customerName: String,
  customerPhone: String,
  eventDate: String,
  guestCount: Number,
  createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

// Sample Venues Fallback
const sampleVenues = [
  {
    name: "Royal Palace Banquet",
    location: "Gulshan-e-Iqbal, Karachi",
    capacity: 500,
    pricePerHead: 1800,
    contactNumber: "03001234567",
    imageUrl: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600"
  },
  {
    name: "Majestic Marquee",
    location: "DHA Phase 8, Karachi",
    capacity: 1000,
    pricePerHead: 3500,
    contactNumber: "03119876543",
    imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600"
  }
];

// Database Connection
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  const dbUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/weddingwala";
  try {
    await mongoose.connect(dbUri);
    isConnected = true;
  } catch (err) {
    console.log("DB Connection Warning (using sample data)");
  }
}

app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// API Routes
app.get('/api/venues', async (req, res) => {
  try {
    let venues = await Venue.find();
    if (venues.length === 0) venues = sampleVenues;
    res.json(venues);
  } catch (err) {
    res.json(sampleVenues);
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const newBooking = new Booking(req.body);
    await newBooking.save();
    res.status(201).json({ message: 'Inquiry saved!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = app;
