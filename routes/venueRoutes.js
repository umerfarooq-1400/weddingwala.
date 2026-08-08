const express = require('express');
const router = express.Router();
const Venue = require('../models/Venue');

// Get All Venues
router.get('/', async (req, res) => {
  try {
    const venues = await Venue.find();
    res.json(venues);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;