// routes/bookingRoutes.js
const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Venue = require('../models/Venue');

// 1. GET /api/bookings/check-slots?venueId=XYZ&date=YYYY-MM-DD
router.get('/check-slots', async (req, res) => {
    try {
        const { venueId, date } = req.query;

        if (!venueId || !date) {
            return res.status(400).json({ success: false, message: 'Venue ID and Date are required' });
        }

        // Find all active bookings for this venue on the chosen date
        const existingBookings = await Booking.find({
            venue_id: venueId,
            booking_date: date,
            status: { $in: ['Hold', 'Confirmed'] }
        });

        // Determine booked slots
        const bookedSlots = existingBookings.map(b => b.slot);

        let availability = {
            Lunch: true,
            Dinner: true,
            'Full Day': true
        };

        if (bookedSlots.includes('Full Day')) {
            availability.Lunch = false;
            availability.Dinner = false;
            availability['Full Day'] = false;
        } else {
            if (bookedSlots.includes('Lunch')) {
                availability.Lunch = false;
                availability['Full Day'] = false;
            }
            if (bookedSlots.includes('Dinner')) {
                availability.Dinner = false;
                availability['Full Day'] = false;
            }
        }

        res.status(200).json({
            success: true,
            date: date,
            bookedSlots: bookedSlots,
            availability: availability
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. POST /api/bookings/create
router.post('/create', async (req, res) => {
    try {
        const { venueId, customerName, customerPhone, bookingDate, slot, guestCount } = req.body;

        // Fetch venue details for price check
        const venue = await Venue.findById(venueId);
        if (!venue) {
            return res.status(404).json({ success: false, message: 'Venue not found' });
        }

        // Conflict Checking Logic
        const existingBookings = await Booking.find({
            venue_id: venueId,
            booking_date: bookingDate,
            status: { $in: ['Hold', 'Confirmed'] }
        });

        const isFullDayBooked = existingBookings.some(b => b.slot === 'Full Day');
        const isSlotBooked = existingBookings.some(b => b.slot === slot);

        if (isFullDayBooked) {
            return res.status(400).json({ success: false, message: 'Venue is already locked for the Full Day on this date!' });
        }

        if (slot === 'Full Day' && existingBookings.length > 0) {
            return res.status(400).json({ success: false, message: 'Cannot lock Full Day because Lunch or Dinner is already booked.' });
        }

        if (isSlotBooked) {
            return res.status(400).json({ success: false, message: `The ${slot} slot is already booked for this date!` });
        }

        // Calculate dynamic price per head based on pricing rules
        let pricePerHead = venue.base_price_per_head;
        const matchingRule = venue.custom_pricing.find(rule => {
            return bookingDate >= rule.start_date && bookingDate <= rule.end_date;
        });
        if (matchingRule) {
            pricePerHead = matchingRule.price_per_head;
        }

        // Full Day Multiplier (e.g., 2 shifts cost or custom logic)
        const totalAmount = pricePerHead * guestCount;

        const newBooking = new Booking({
            venue_id: venueId,
            customer_name: customerName,
            customer_phone: customerPhone,
            booking_date: bookingDate,
            slot: slot,
            guest_count: guestCount,
            price_per_head: pricePerHead,
            total_amount: totalAmount
        });

        await newBooking.save();

        res.status(201).json({
            success: true,
            message: `Booking successfully confirmed for ${slot}!`,
            data: newBooking
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;