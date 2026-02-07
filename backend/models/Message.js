const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, default: "" }, // Changed: text is NOT required
    gif: { type: String, default: "" },  // Added: gif field
    timestamp: { type: Date, default: Date.now },
    room: { type: String, default: "global" }, // NEW: The ID of the chatroom
});

module.exports = mongoose.model('Message', MessageSchema);