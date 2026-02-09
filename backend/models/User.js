const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    coins: { type: Number, default: 0 },
    // --- NEW PROFILE FIELDS ---
    bio: { type: String, default: "System Operator" },
    avatar: { type: String, default: "" }, // URL to image
    status: { type: String, default: "ONLINE" },
    lastSeen: { type: Date, default: Date.now },
    unlockedThemes: { type: [String], default: ['default'] },
    activeTheme: { type: String, default: 'default' }
});

module.exports = mongoose.model('User', UserSchema);