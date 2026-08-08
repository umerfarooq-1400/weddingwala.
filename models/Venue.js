const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema({
  title: { type: String, required: true },
  location: { type: String, required: true },
  capacity: { type: Number, required: true },
  pricePerHead: { type: Number, required: true },
  amenities: [String],
  images: [String]
}, { timestamps: true });

module.exports = mongoose.model('Venue', venueSchema);