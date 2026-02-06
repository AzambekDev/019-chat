const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// 1. IMPORT MODELS (Check that this path matches your folder name)
const Message = require('./models/Message'); 

const app = express();



app.use(cors({
    origin: "*", // Allows any site to connect for testing
    methods: ["GET", "POST"]
}));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Matches the app.use above
        methods: ["GET", "POST"]
    },
    transports: ['websocket'] // Matches the frontend setting
});


// 4. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => console.log("--- DATABASE_SYNC_COMPLETE ---"))
    .catch(err => console.error("!!! DB_SYNC_FAILURE:", err));

// 5. SOCKET LOGIC
io.on('connection', (socket) => {
    console.log(`LINK_ESTABLISHED: ${socket.id}`);

    // Load history
    Message.find().sort({ timestamp: 1 }).limit(50)
        .then(messages => {
            socket.emit('load_messages', messages);
        });

    socket.on('send_message', async (data) => {
        try {
            const newMessage = new Message({
                sender: data.user || "Unknown_Operator",
                text: data.text
            });
            await newMessage.save();

            io.emit('receive_message', {
                sender: newMessage.sender,
                text: newMessage.text,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } catch (err) {
            console.error("TRANSMISSION_ERROR:", err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`LINK_TERMINATED: ${socket.id}`);
    });
});

// 6. RENDER PORT BINDING
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`019_PROTOCOL_LIVE_ON_PORT_${PORT}`);
});