const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventDate: { type: Date, required: true },
  slot: { type: String, enum: ['Evening', 'Night'], required: true },
  totalGuests: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);