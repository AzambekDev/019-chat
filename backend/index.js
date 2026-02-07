const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const Message = require('./models/Message'); 
const User = require('./models/User');

const app = express();

app.use(express.json());
app.use(cors({
    origin: "https://019-chat.vercel.app",
    methods: ["GET", "POST"]
}));

// --- AUTH ROUTES ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, role: 'user' });
        await newUser.save();
        res.status(201).json({ message: "User Created" });
    } catch (err) {
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '7d' });
        
        res.json({ 
            token, 
            username: user.username,
            role: user.role 
        });
    } catch (err) {
        console.error("LOGIN_ERR:", err);
        res.status(500).json({ error: "Login error" });
    }
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://019-chat.vercel.app",
        methods: ["GET", "POST"]
    }
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("--- 019_DATABASE_CONNECTED ---"))
    .catch(err => console.error("DB_ERROR:", err));

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log(`LINK_ESTABLISHED: ${socket.id}`);

    Message.find().sort({ timestamp: 1 }).limit(50).then(messages => {
        socket.emit('load_messages', messages);
    });

    // --- UPDATED SEND_MESSAGE FOR GIFs ---
    socket.on('send_message', async (data) => {
        try {
            const newMessage = new Message({ 
                sender: data.user, 
                text: data.text || "", 
                gif: data.gif || "" // Added GIF support here
            });
            const savedMessage = await newMessage.save();

            // --- COIN LOGIC ---
            // Find the sender and increment their coins by 0.01
            const updatedUser = await User.findOneAndUpdate(
                { username: data.user },
                { $inc: { coins: 0.01 } },
                { new: true } // Returns the updated document
            );

            io.emit('receive_message', savedMessage); 

            // Send updated coin balance ONLY to the person who sent the message
            socket.emit('coin_update', updatedUser.coins);

        } catch (err) {
            console.error("SEND_ERROR:", err);
        }
    });

    // --- DELETE LOGIC ---
    socket.on('delete_message', async (data) => {
        try {
            const { messageId, username } = data;
            const message = await Message.findById(messageId);
            const user = await User.findOne({ username });

            if (!message || !user) return;

            const isOwner = message.sender === username;
            const isAdmin = user.role === 'admin' || username === 'iloveshirin';

            if (isOwner || isAdmin) {
                await Message.findByIdAndDelete(messageId);
                io.emit('message_deleted', messageId);
                console.log(`SUCCESS: Deleted by ${username}`);
            } else {
                console.log(`DENIED: ${username} attempted deletion`);
            }
        } catch (err) {
            console.error("DELETE_ERROR:", err);
        }
    });

    // --- PURGE LOGIC ---
    socket.on('clear_all_messages', async (username) => {
        try {
            const user = await User.findOne({ username });
            if (user && (user.role === 'admin' || username === 'iloveshirin')) {
                await Message.deleteMany({});
                io.emit('chat_cleared');
                console.log(`--- CHAT_PURGED_BY_${username} ---`);
            }
        } catch (err) {
            console.error("PURGE_ERROR:", err);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`019_PROTOCOL_ONLINE_ON_PORT_${PORT}`);
});