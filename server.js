const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = express();
app.use(express.json());
app.use(cors());

// Express Static Files
app.use(express.static(__dirname));

// Multer Setup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

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
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

// Sample Data
const sampleVenues = [
  {
    name: "Royal Palace Banquet",
    location: "Gulshan-e-Iqbal, Karachi",
    capacity: 500,
    pricePerHead: 1800,
    contactNumber: "03001234567",
    imageUrl: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600",
    isAvailable: true
  },
  {
    name: "Majestic Marquee",
    location: "DHA Phase 8, Karachi",
    capacity: 1000,
    pricePerHead: 3500,
    contactNumber: "03119876543",
    imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600",
    isAvailable: true
  }
];

async function startServer() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  console.log('✅ In-Memory MongoDB Connected!');

  await Venue.deleteMany({});
  await Venue.insertMany(sampleVenues);

  // --- VENUES ROUTES ---
  app.get('/api/venues', async (req, res) => {
    const venues = await Venue.find();
    res.json(venues);
  });

  app.post('/api/venues', upload.single('image'), async (req, res) => {
    const venueData = {
      name: req.body.name,
      location: req.body.location,
      capacity: Number(req.body.capacity),
      pricePerHead: Number(req.body.pricePerHead),
      contactNumber: req.body.contactNumber,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : ''
    };
    const newVenue = new Venue(venueData);
    await newVenue.save();
    res.status(201).json({ message: '✅ Venue added!', venue: newVenue });
  });

  app.put('/api/venues/:id', upload.single('image'), async (req, res) => {
    const updateData = {
      name: req.body.name,
      location: req.body.location,
      capacity: Number(req.body.capacity),
      pricePerHead: Number(req.body.pricePerHead),
      contactNumber: req.body.contactNumber
    };
    if (req.file) updateData.imageUrl = `/uploads/${req.file.filename}`;
    const updated = await Venue.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ message: '✅ Venue updated!', venue: updated });
  });

  app.delete('/api/venues/:id', async (req, res) => {
    await Venue.findByIdAndDelete(req.params.id);
    res.json({ message: '🗑️ Venue deleted!' });
  });

  // --- BOOKINGS ROUTES ---
  app.get('/api/bookings', async (req, res) => {
    try {
      const bookings = await Booking.find().sort({ createdAt: -1 });
      res.json(bookings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/bookings', async (req, res) => {
    const newBooking = new Booking(req.body);
    await newBooking.save();
    res.status(201).json({ message: '✅ Inquiry received!', booking: newBooking });
  });

  app.delete('/api/bookings/:id', async (req, res) => {
    try {
      await Booking.findByIdAndDelete(req.params.id);
      res.json({ message: '🗑️ Booking deleted!' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

  app.listen(5000, () => console.log('🚀 Server running on http://localhost:5000'));
}

startServer().catch(err => console.error(err));