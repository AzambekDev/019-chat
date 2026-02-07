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
        const newUser = new User({ 
            username, 
            password: hashedPassword, 
            role: 'user', 
            coins: 0,
            unlockedThemes: ['default'],
            activeTheme: 'default'
        });
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
            role: user.role,
            coins: user.coins || 0,
            activeTheme: user.activeTheme || 'default',
            unlockedThemes: user.unlockedThemes || ['default']
        });
    } catch (err) {
        console.error("LOGIN_ERR:", err);
        res.status(500).json({ error: "Login error" });
    }
});

// --- NEW: USER SEARCH ROUTE ---
app.get('/api/users/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);
        
        // Find users starting with the query string (case-insensitive)
        const users = await User.find({ 
            username: { $regex: `^${query}`, $options: 'i' } 
        })
        .limit(5)
        .select('username role'); // Only return necessary fields
        
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Search failed" });
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

    // --- 1. JOIN ROOM LOGIC ---
    socket.on('join_room', async (room) => {
        // Leave previous rooms
        socket.rooms.forEach(r => {
            if (r !== socket.id) socket.leave(r);
        });

        socket.join(room);
        console.log(`OPERATOR_${socket.id} entered channel: ${room}`);

        // Load messages specifically for this room/DM
        const messages = await Message.find({ room: room || 'global' })
            .sort({ timestamp: 1 })
            .limit(50);
        
        socket.emit('load_messages', messages);
    });

    // --- 2. MESSAGE & COIN LOGIC ---
    socket.on('send_message', async (data) => {
        try {
            const targetRoom = data.room || 'global';

            const newMessage = new Message({ 
                sender: data.user, 
                text: data.text || "", 
                gif: data.gif || "",
                room: targetRoom
            });
            const savedMessage = await newMessage.save();

            const updatedUser = await User.findOneAndUpdate(
                { username: data.user },
                { $inc: { coins: 0.01 } },
                { new: true }
            );

            // Emit specifically to that room
            io.to(targetRoom).emit('receive_message', savedMessage); 

            if (updatedUser) {
                socket.emit('coin_update', updatedUser.coins);
            }
        } catch (err) {
            console.error("SEND_ERROR:", err);
        }
    });

    // --- 3. DELETE LOGIC ---
    socket.on('delete_message', async (data) => {
        try {
            const { messageId, username } = data;
            const message = await Message.findById(messageId);
            const user = await User.findOne({ username });
            if (!message || !user) return;

            if (message.sender === username || user.role === 'admin' || username === 'iloveshirin') {
                const targetRoom = message.room;
                await Message.findByIdAndDelete(messageId);
                io.to(targetRoom).emit('message_deleted', messageId);
            }
        } catch (err) {
            console.error("DELETE_ERROR:", err);
        }
    });

    // --- 4. PURGE LOGIC ---
    socket.on('clear_all_messages', async (username) => {
        try {
            const user = await User.findOne({ username });
            if (user && (user.role === 'admin' || username === 'iloveshirin')) {
                await Message.deleteMany({});
                io.emit('chat_cleared');
                console.log(`--- GLOBAL_CHAT_PURGED_BY_${username} ---`);
            }
        } catch (err) {
            console.error("PURGE_ERROR:", err);
        }
    });

    // --- 5. THEME PURCHASE LOGIC ---
    socket.on('purchase_theme', async ({ username, themeId, cost }) => {
        try {
            const user = await User.findOne({ username });
            if (user && user.coins >= cost && !user.unlockedThemes.includes(themeId)) {
                user.coins -= cost;
                user.unlockedThemes.push(themeId);
                user.activeTheme = themeId;
                await user.save();
                
                socket.emit('coin_update', user.coins);
                socket.emit('theme_unlocked', { 
                    unlocked: user.unlockedThemes, 
                    active: user.activeTheme 
                });
            }
        } catch (err) {
            console.error("PURCHASE_ERR:", err);
        }
    });

    // --- 6. ADMIN COIN COMMAND ---
    socket.on('admin_grant_coins', async ({ username }) => {
        try {
            if (username === 'iloveshirin') {
                const updatedUser = await User.findOneAndUpdate(
                    { username },
                    { $inc: { coins: 100 } },
                    { new: true }
                );
                if (updatedUser) {
                    socket.emit('coin_update', updatedUser.coins);
                    console.log(`ADMIN_GRANT: 100 coins added to ${username}`);
                }
            }
        } catch (err) {
            console.error("GRANT_ERROR:", err);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`019_PROTOCOL_ONLINE_ON_PORT_${PORT}`);
});