const mongoose = require('mongoose');
const Venue = require('./models/Venue');

// Direct MongoDB Cloud Link
const MONGO_URI = 'mongodb+srv://weddingwala_user:WeddingWala123@cluster0.mongodb.net/weddingwala?retryWrites=true&w=majority';

// Test Data (Karachi Venues)
const sampleVenues = [
  {
    name: "Royal Palace Banquet",
    location: "Gulshan-e-Iqbal, Karachi",
    capacity: 500,
    pricePerHead: 1800,
    contactNumber: "03001234567",
    isAvailable: true
  },
  {
    name: "Majestic Marquee",
    location: "DHA Phase 8, Karachi",
    capacity: 1000,
    pricePerHead: 3500,
    contactNumber: "03119876543",
    isAvailable: true
  },
  {
    name: "Grand Arena Lawn",
    location: "PECHS Block 6, Karachi",
    capacity: 750,
    pricePerHead: 2200,
    contactNumber: "03215554433",
    isAvailable: true
  }
];

async function seedDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Database Connected for Seeding...");

    // Purana data clear karein
    await Venue.deleteMany({});
    console.log("🧹 Purana data clear kar diya gaya.");

    // Naya data add karein
    await Venue.insertMany(sampleVenues);
    console.log("🎉 Test Venues Successfully Add Ho Gaye!");

    process.exit();
  } catch (error) {
    console.error("❌ Seed karne mein error aaya:", error);
    process.exit(1);
  }
}

seedDatabase();