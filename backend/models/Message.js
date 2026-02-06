const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  // This maps to 'user' from your frontend
  sender: { 
    type: String, 
    required: true,
    default: 'Anonymous' 
  },
  // This is the actual message string
  text: { 
    type: String, 
    required: true 
  },
  // Automatically store the time the message was created
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
});

module.exports = mongoose.model('Message', MessageSchema);