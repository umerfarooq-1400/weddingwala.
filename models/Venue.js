const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    address: { 
        type: String, 
        required: true 
    },
    city: { 
        type: String, 
        default: 'Karachi' 
    },
    contactPhone: { 
        type: String, 
        required: true 
    },
    contactEmail: { 
        type: String 
    },
    capacity: { 
        type: Number, 
        default: 500 
    },
    basePrice: { 
        type: Number, 
        default: 150000 
    },
    
    // RATING & REVIEWS METRICS
    avgRating: { 
        type: Number, 
        default: 0 
    },
    totalReviews: { 
        type: Number, 
        default: 0 
    },

    // VENDOR SUBSCRIPTION STATUS
    subscriptionPlan: { 
        type: String, 
        enum: ['Basic', 'Pro', 'Enterprise'], 
        default: 'Basic' 
    },
    isApproved: { 
        type: Boolean, 
        default: true 
    },

    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Venue', venueSchema);