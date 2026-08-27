require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import Schemas
const Venue = require('./models/Venue');
const Booking = require('./models/Booking');
const Review = require('./models/Review');

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection String (Fallback Included to Prevent Vercel Crashes)
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://admin:admin123@cluster0.abcde.mongodb.net/weddingwala?retryWrites=true&w=majority";

// Serverless Caching Connection Variable
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }
    
    try {
        const db = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            bufferCommands: false
        });
        cachedDb = db;
        console.log("MongoDB Connected Successfully");
        return cachedDb;
    } catch (err) {
        console.error("MongoDB Connection Failed:", err.message);
        throw err;
    }
}

// Ensure DB connection for all incoming API routes
app.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: "Database Connection Error. Ensure MongoDB Atlas IP is set to 0.0.0.0/0." 
        });
    }
});

// Health Check Route
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: "WeddingWala API Backend is Running Smoothly!" });
});

// =========================================================================
// 1. VENUE ROUTES
// =========================================================================

// Fetch All Approved Venues
app.get('/api/venues', async (req, res) => {
    try {
        const venues = await Venue.find({ isApproved: true }).sort({ avgRating: -1 });
        res.json({ success: true, count: venues.length, venues });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Register New Venue
app.post('/api/venues/register', async (req, res) => {
    try {
        const newVenue = new Venue(req.body);
        await newVenue.save();
        res.status(201).json({ success: true, venue: newVenue });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Approve/Reject Venue (Admin)
app.patch('/api/venues/approve/:id', async (req, res) => {
    try {
        const { isApproved } = req.body;
        const updatedVenue = await Venue.findByIdAndUpdate(
            req.params.id,
            { isApproved },
            { new: true }
        );
        res.json({ success: true, message: "Venue status updated!", venue: updatedVenue });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// 2. BOOKING & SLOT LOCK ROUTES
// =========================================================================

// Reserve Slot & Lock
app.post('/api/bookings/lock-slot', async (req, res) => {
    try {
        const { venueId, customerName, customerPhone, customerEmail, bookingDate, slot, guestCount, totalAmount, status, depositPaid } = req.body;

        const existingBooking = await Booking.findOne({
            venueId,
            bookingDate,
            slot,
            status: { $in: ['Pending', 'Confirmed'] }
        });

        if (existingBooking) {
            return res.status(400).json({ 
                success: false, 
                message: "Yeh slot pehle se locked/booked hai. Dusri date ya slot choose karein." 
            });
        }

        const newBooking = new Booking({
            venueId,
            customerName,
            customerPhone,
            customerEmail,
            bookingDate,
            slot,
            guestCount,
            totalAmount,
            depositPaid: depositPaid || 0,
            status: status || 'Pending'
        });

        await newBooking.save();

        res.status(201).json({ 
            success: true, 
            message: "Slot 15 minutes ke liye hold kar diya gaya hai.", 
            bookingId: newBooking._id 
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get Venue Bookings (Owner)
app.get('/api/bookings/venue/:venueId', async (req, res) => {
    try {
        const bookings = await Booking.find({ venueId: req.params.venueId }).sort({ bookingDate: 1 });
        res.json({ success: true, count: bookings.length, bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Process Token Deposit Payment
app.post('/api/payments/process-token', async (req, res) => {
    try {
        const { bookingId, depositAmount } = req.body;
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking record nahi mila." });
        }

        booking.depositPaid = Number(depositAmount);
        booking.paymentTxnRef = "TKN-" + Date.now();
        booking.status = 'Confirmed';
        await booking.save();

        res.status(200).json({ success: true, message: "Payment status confirmed!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// 3. REVIEWS ROUTES
// =========================================================================

app.post('/api/reviews/add', async (req, res) => {
    try {
        const { venueId, customerName, customerEmail, rating, comment } = req.body;
        const newReview = new Review({ venueId, customerName, customerEmail, rating: Number(rating), comment });
        await newReview.save();

        const stats = await Review.aggregate([
            { $match: { venueId: new mongoose.Types.ObjectId(venueId) } },
            { $group: { _id: '$venueId', avgRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } }
        ]);

        if (stats.length > 0) {
            await Venue.findByIdAndUpdate(venueId, {
                avgRating: Math.round(stats[0].avgRating * 10) / 10,
                totalReviews: stats[0].totalReviews
            });
        }

        res.status(201).json({ success: true, message: "Review added!", review: newReview });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/reviews/:venueId', async (req, res) => {
    try {
        const reviews = await Review.find({ venueId: req.params.venueId }).sort({ createdAt: -1 });
        res.json({ success: true, count: reviews.length, reviews });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Local Development Support
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Local Server: http://localhost:${PORT}`));
}

module.exports = app;
