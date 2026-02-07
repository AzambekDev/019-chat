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

app.get('/api/users/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);
        const users = await User.find({ 
            username: { $regex: `^${query}`, $options: 'i' } 
        })
        .limit(5)
        .select('username role');
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
    socket.on('join_room', async (data) => {
        // data can now be an object { room, username }
        const room = typeof data === 'string' ? data : data.room;
        const userHandle = typeof data === 'object' ? data.username : null;

        // Leave previous chat rooms, but NOT the personal username room
        socket.rooms.forEach(r => {
            if (r !== socket.id && r !== userHandle) socket.leave(r);
        });

        socket.join(room);
        
        // If username is provided, ensure they are always in their personal alert room
        if (userHandle) {
            socket.join(userHandle);
            console.log(`OPERATOR_${userHandle} listening for alerts.`);
        }

        console.log(`LINK_STABLE: Joined room ${room}`);

        const messages = await Message.find({ room: room || 'global' })
            .sort({ timestamp: 1 })
            .limit(50);
        
        socket.emit('load_messages', messages);
    });

    // --- 2. MESSAGE & NOTIFICATION LOGIC ---
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

            // Broadcast to everyone in the room
            io.to(targetRoom).emit('receive_message', savedMessage); 

            // --- NEW: PRIVATE MESSAGE NOTIFICATION ---
            if (targetRoom.includes("_DM_")) {
                const parts = targetRoom.split("_DM_");
                const recipient = parts.find(p => p !== data.user);
                
                // Alert the recipient specifically
                io.to(recipient).emit('incoming_dm_alert', {
                    from: data.user,
                    room: targetRoom,
                    text: data.text || "Sent a GIF"
                });
            }

            const updatedUser = await User.findOneAndUpdate(
                { username: data.user },
                { $inc: { coins: 0.01 } },
                { new: true }
            );

            if (updatedUser) {
                socket.emit('coin_update', updatedUser.coins);
            }
        } catch (err) {
            console.error("SEND_ERROR:", err);
        }
    });

    // --- 3. DELETE/PURGE/ADMIN REMAIN UNCHANGED ---
    socket.on('delete_message', async (data) => {
        try {
            const { messageId, username } = data;
            const msg = await Message.findById(messageId);
            const user = await User.findOne({ username });
            if (!msg || !user) return;

            if (msg.sender === username || user.role === 'admin' || username === 'iloveshirin') {
                const targetRoom = msg.room;
                await Message.findByIdAndDelete(messageId);
                io.to(targetRoom).emit('message_deleted', messageId);
            }
        } catch (err) {
            console.error("DELETE_ERROR:", err);
        }
    });

    socket.on('clear_all_messages', async (username) => {
        try {
            const user = await User.findOne({ username });
            if (user && (user.role === 'admin' || username === 'iloveshirin')) {
                await Message.deleteMany({});
                io.emit('chat_cleared');
            }
        } catch (err) {
            console.error("PURGE_ERROR:", err);
        }
    });

    socket.on('purchase_theme', async ({ username, themeId, cost }) => {
        try {
            const user = await User.findOne({ username });
            if (user && user.coins >= cost && !user.unlockedThemes.includes(themeId)) {
                user.coins -= cost;
                user.unlockedThemes.push(themeId);
                user.activeTheme = themeId;
                await user.save();
                socket.emit('coin_update', user.coins);
                socket.emit('theme_unlocked', { unlocked: user.unlockedThemes, active: user.activeTheme });
            }
        } catch (err) {
            console.error("PURCHASE_ERR:", err);
        }
    });

    socket.on('admin_grant_coins', async ({ username }) => {
        try {
            if (username === 'iloveshirin') {
                const updatedUser = await User.findOneAndUpdate({ username }, { $inc: { coins: 100 } }, { new: true });
                if (updatedUser) socket.emit('coin_update', updatedUser.coins);
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