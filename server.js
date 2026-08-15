require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import Schemas
const Venue = require('./models/Venue');
const Booking = require('./models/Booking');
const Review = require('./models/Review');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serverless-Friendly Optimized MongoDB Connection
let isConnected = false;
async function connectToDatabase() {
    if (isConnected && mongoose.connection.readyState === 1) {
        return;
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/weddingwala', {
            serverSelectionTimeoutMS: 5000,
        });
        isConnected = true;
        console.log('MongoDB Database Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
    }
}

// Middleware to ensure DB connection on every request
app.use(async (req, res, next) => {
    await connectToDatabase();
    next();
});

// Root Health Check Route
app.get('/', (req, res) => {
    res.json({ success: true, message: "WeddingWala API Backend is Running Successfully on Vercel!" });
});

// =========================================================================
// 1. VENUE ROUTES
// =========================================================================

app.get('/api/venues', async (req, res) => {
    try {
        const venues = await Venue.find({ isApproved: true }).sort({ avgRating: -1 });
        res.json({ success: true, count: venues.length, venues });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/venues/register', async (req, res) => {
    try {
        const newVenue = new Venue(req.body);
        await newVenue.save();
        res.status(201).json({ success: true, venue: newVenue });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.patch('/api/venues/approve/:id', async (req, res) => {
    try {
        const { isApproved } = req.body;
        const updatedVenue = await Venue.findByIdAndUpdate(
            req.params.id,
            { isApproved },
            { new: true }
        );
        res.json({ success: true, message: `Venue status updated!`, venue: updatedVenue });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// 2. BOOKING & SLOT LOCK ROUTES
// =========================================================================

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
                message: "Yeh slot already locked/booked hai. Dusri date ya slot choose karein." 
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
            message: status === 'Confirmed' ? "Slot confirm ho gaya!" : "Slot 15 minutes ke liye hold kar diya gaya hai.", 
            bookingId: newBooking._id 
        });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: "Conflict: Slot pehle hi locked hai." });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/bookings/venue/:venueId', async (req, res) => {
    try {
        const bookings = await Booking.find({ venueId: req.params.venueId }).sort({ bookingDate: 1 });
        res.json({ success: true, count: bookings.length, bookings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/payments/process-token', async (req, res) => {
    try {
        const { bookingId, customerPhone, depositAmount } = req.body;

        const booking = await Booking.findById(bookingId).populate('venueId');
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking record nahi mila." });
        }

        const txnRefNo = "TKN-" + Date.now();

        booking.depositPaid = Number(depositAmount);
        booking.paymentTxnRef = txnRefNo;
        booking.status = 'Confirmed';
        await booking.save();

        res.status(200).json({
            success: true,
            message: "Payment success! Receipt generation complete.",
            txnRefNo
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Vercel Safe PDF Invoice Route
app.get('/api/bookings/invoice/:bookingId', async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const booking = await Booking.findById(req.params.bookingId).populate('venueId');
        
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking record nahi mila." });
        }

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Invoice_${booking._id}.pdf`);

        doc.pipe(res);
        doc.fontSize(20).text('WeddingWala Booking Receipt', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Booking ID: ${booking._id}`);
        doc.text(`Customer Name: ${booking.customerName}`);
        doc.text(`Date: ${booking.bookingDate}`);
        doc.text(`Slot: ${booking.slot}`);
        doc.text(`Deposit Paid: Rs. ${booking.depositPaid}`);
        doc.end();

    } catch (err) {
        res.status(500).json({ success: false, message: "PDF generation failed: " + err.message });
    }
});

// =========================================================================
// 3. REVIEWS ROUTES
// =========================================================================

app.post('/api/reviews/add', async (req, res) => {
    try {
        const { venueId, customerName, customerEmail, rating, comment } = req.body;

        if (!venueId || !customerName || !rating || !comment) {
            return res.status(400).json({ success: false, message: "Fields complete enter karein." });
        }

        const newReview = new Review({
            venueId,
            customerName,
            customerEmail,
            rating: Number(rating),
            comment
        });
        await newReview.save();

        const stats = await Review.aggregate([
            { $match: { venueId: new mongoose.Types.ObjectId(venueId) } },
            {
                $group: {
                    _id: '$venueId',
                    avgRating: { $avg: '$rating' },
                    totalReviews: { $sum: 1 }
                }
            }
        ]);

        if (stats.length > 0) {
            const roundedAvg = Math.round(stats[0].avgRating * 10) / 10;
            await Venue.findByIdAndUpdate(venueId, {
                avgRating: roundedAvg,
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

module.exports = app;
