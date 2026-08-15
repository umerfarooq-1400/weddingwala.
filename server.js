require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const twilio = require('twilio');

// Import Schemas
const Venue = require('./models/Venue');
const Booking = require('./models/Booking');
const Review = require('./models/Review');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serverless-Friendly MongoDB Connection Handler
let isConnected = false;
async function connectToDatabase() {
    if (isConnected && mongoose.connection.readyState === 1) {
        return;
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/weddingwala');
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

// Initialize Twilio Client
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Helper: WhatsApp & SMS Dispatcher
async function sendBookingNotifications({ customerPhone, managerPhone, customerName, venueName, bookingDate, slot, depositPaid, bookingId }) {
    const formatPhone = (phone) => {
        let clean = phone.replace(/[^0-9]/g, '');
        if (clean.startsWith('0')) clean = '92' + clean.slice(1);
        return '+' + clean;
    };

    const formattedCustomerPhone = formatPhone(customerPhone);
    const formattedManagerPhone = managerPhone ? formatPhone(managerPhone) : null;

    const customerMsg = `🎉 *Booking Confirmation - WeddingWala*\n\nDear *${customerName}*,\nYour booking at *${venueName}* has been locked!\n\n📅 *Date:* ${bookingDate}\n⏰ *Slot:* ${slot}\n💰 *Token Deposit:* Rs. ${Number(depositPaid).toLocaleString()}\n🆔 *Booking ID:* REC-${bookingId.toString().slice(-6).toUpperCase()}\n\nThank you for choosing WeddingWala!`;
    const managerMsg = `🔔 *NEW BOOKING ALERT - WeddingWala*\n\nHello Manager,\nA new slot has been locked for *${venueName}*.\n\n👤 *Customer:* ${customerName} (${customerPhone})\n📅 *Date:* ${bookingDate}\n⏰ *Slot:* ${slot}\n💵 *Deposit Received:* Rs. ${Number(depositPaid).toLocaleString()}`;

    try {
        await twilioClient.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: `whatsapp:${formattedCustomerPhone}`,
            body: customerMsg
        });

        await twilioClient.messages.create({
            from: process.env.TWILIO_PHONE_NUMBER,
            to: formattedCustomerPhone,
            body: `WeddingWala: Booking confirmed for ${venueName} on ${bookingDate} (${slot}). Token Paid: Rs. ${depositPaid}.`
        });

        if (formattedManagerPhone) {
            await twilioClient.messages.create({
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: `whatsapp:${formattedManagerPhone}`,
                body: managerMsg
            });
        }
    } catch (error) {
        console.error("Twilio Notification Error:", error.message);
    }
}

// Root Status Check Endpoint
app.get('/', (req, res) => {
    res.json({ status: "WeddingWala API Backend is Running Successfully!" });
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
        res.json({ success: true, message: `Venue status updated!`, venue: updatedVenue });
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
            message: status === 'Confirmed' ? "Slot offline confirm ho gaya!" : "Slot 15 minutes ke liye hold kar diya gaya hai.", 
            bookingId: newBooking._id 
        });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: "Conflict: Slot pehle hi locked hai." });
        }
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

        const venueName = booking.venueId ? booking.venueId.name : 'Banquet Hall';
        const managerPhone = booking.venueId ? booking.venueId.contactPhone : null;

        sendBookingNotifications({
            customerPhone: customerPhone || booking.customerPhone,
            managerPhone,
            customerName: booking.customerName,
            venueName,
            bookingDate: booking.bookingDate,
            slot: booking.slot,
            depositPaid: depositAmount,
            bookingId: booking._id
        });

        res.status(200).json({
            success: true,
            message: "Payment success! PDF receipt aur WhatsApp alert dispatch ho gaya hai.",
            txnRefNo
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// 3. AUTOMATED PDF INVOICE GENERATOR
// =========================================================================
app.get('/api/bookings/invoice/:bookingId', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.bookingId).populate('venueId');
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking record nahi mila." });
        }

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=WeddingWala_Invoice_${booking._id}.pdf`);

        doc.pipe(res);

        // Header
        doc.fillColor('#1d3557').fontSize(24).text('WeddingWala', 50, 45, { bold: true })
           .fontSize(10).fillColor('#64748b').text('Official Booking Receipt & Invoice', 50, 75);

        doc.fillColor('#2a9d8f').fontSize(12).text('PAID DEPOSIT', 400, 50, { align: 'right', bold: true })
           .fontSize(9).fillColor('#64748b')
           .text(`Receipt #: REC-${booking._id.toString().slice(-6).toUpperCase()}`, 400, 68, { align: 'right' })
           .text(`Date: ${new Date(booking.createdAt).toLocaleDateString()}`, 400, 82, { align: 'right' });

        doc.moveTo(50, 105).lineTo(550, 105).strokeColor('#e2e8f0').stroke();

        // Details
        doc.fontSize(11).fillColor('#1d3557').text('Customer Details:', 50, 120, { bold: true });
        doc.fontSize(10).fillColor('#334155')
           .text(`Name: ${booking.customerName}`)
           .text(`Phone: ${booking.customerPhone}`)
           .text(`Email: ${booking.customerEmail || 'N/A'}`);

        const venueName = booking.venueId ? booking.venueId.name : 'Banquet Venue';
        const venueAddress = booking.venueId ? booking.venueId.address : 'Karachi, Pakistan';

        doc.fontSize(11).fillColor('#1d3557').text('Venue Details:', 320, 120, { bold: true });
        doc.fontSize(10).fillColor('#334155')
           .text(`Venue: ${venueName}`, 320, 135)
           .text(`Location: ${venueAddress}`, 320, 150);

        doc.moveTo(50, 190).lineTo(550, 190).strokeColor('#e2e8f0').stroke();

        // Summary Table
        doc.rect(50, 210, 500, 25).fill('#f1f5f9');
        doc.fillColor('#1d3557').fontSize(10)
           .text('Description', 60, 217, { bold: true })
           .text('Event Date', 240, 217, { bold: true })
           .text('Slot', 360, 217, { bold: true })
           .text('Guests', 480, 217, { bold: true });

        doc.fillColor('#334155')
           .text(`${venueName} Reservation`, 60, 245)
           .text(`${booking.bookingDate}`, 240, 245)
           .text(`${booking.slot}`, 360, 245)
           .text(`${booking.guestCount || 'N/A'}`, 480, 245);

        doc.moveTo(50, 275).lineTo(550, 275).strokeColor('#e2e8f0').stroke();

        // Financial Breakdown
        const totalAmt = booking.totalAmount || 0;
        const paidAmt = booking.depositPaid || 0;
        const remainingAmt = totalAmt - paidAmt;

        doc.fontSize(10).fillColor('#334155')
           .text('Total Event Package:', 320, 295)
           .text(`Rs. ${totalAmt.toLocaleString()}`, 460, 295, { align: 'right' });

        doc.fillColor('#16a34a')
           .text('Advance Token Paid:', 320, 315)
           .text(`- Rs. ${paidAmt.toLocaleString()}`, 460, 315, { align: 'right' });

        doc.rect(310, 335, 240, 30).fill('#fef2f2');
        doc.fillColor('#dc2626').fontSize(11)
           .text('Remaining Balance Due:', 320, 343, { bold: true })
           .text(`Rs. ${remainingAmt.toLocaleString()}`, 450, 343, { align: 'right', bold: true });

        doc.fontSize(9).fillColor('#94a3b8')
           .text('* Note: Total remaining balance event day par venue manager ko direct pay karna hoga.', 50, 400)
           .text('Thank you for booking with WeddingWala platform!', 50, 415, { align: 'center' });

        doc.end();

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// 4. REVIEWS & RATING AGGREGATION ROUTES
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

// Export for Vercel Serverless Function & Support Local Server
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`WeddingWala Local Server running on port ${PORT}`);
    });
}

module.exports = app;
