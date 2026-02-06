const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose'); // Add this
require('dotenv').config();

const app = express();
app.use(cors());

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ 019 Database Connected Successfully'))
    .catch((err) => console.error('❌ Database Connection Error:', err));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3002",
        methods: ["GET", "POST"]
    }
});

const Message = require('./models/Message'); // Import the model at the top

io.on('connection', async (socket) => {
    console.log('User connected to 019:', socket.id);

    // 1. Fetch old messages from MongoDB and send them to the new user
    try {
        const existingMessages = await Message.find().sort({ timestamp: 1 }).limit(50);
        socket.emit('load_messages', existingMessages.map(m => m.text));
    } catch (err) {
        console.error(err);
    }

    // 2. Handle new incoming messages
    socket.on('send_message', async (data) => {
    try {
        // 'data' is the object { user: '...', text: '...' }
        // We need to map these to the correct schema fields
        const newMessage = new Message({ 
            sender: data.user,  // Map 'user' from frontend to 'sender' in DB
            text: data.text     // Map 'text' from frontend to 'text' in DB
        });
        
        // Save to MongoDB
        await newMessage.save();

        // Broadcast the object back to everyone so the UI can render it
        io.emit('receive_message', {
    sender: data.user,
    text: data.text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
});
    } catch (err) {
        console.error("Error saving message:", err);
    }
});
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 019 Server spinning on port ${PORT}`);
});