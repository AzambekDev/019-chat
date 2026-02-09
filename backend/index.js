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

// --- IDENTITY & PROFILE ROUTES ---

// expanded Registration: Handles email, avatar, bio, and instant login
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email, avatar, bio } = req.body;

        // 1. Validation Check
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ error: "IDENTITY_CONFLICT: Username or Email already active." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 2. Create User with Dossier Fields
        const newUser = new User({ 
            username, 
            email, 
            password: hashedPassword, 
            role: 'user', 
            coins: 5.0, // Initial bonus for new operators
            unlockedThemes: ['default'],
            activeTheme: 'default',
            bio: bio || "SYSTEM_OPERATOR",
            avatar: avatar || "", // URL to image
            status: "ONLINE"
        });

        await newUser.save();

        // 3. Auto-Login Handshake (Generate Token)
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '7d' });

        res.status(201).json({ 
            message: "IDENTITY_ESTABLISHED",
            token,
            username: newUser.username,
            role: newUser.role,
            coins: newUser.coins,
            activeTheme: newUser.activeTheme,
            unlockedThemes: newUser.unlockedThemes,
            bio: newUser.bio,
            avatar: newUser.avatar
        });
    } catch (err) {
        console.error("REG_ERR:", err);
        res.status(500).json({ error: "REGISTRATION_FAILURE" });
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
            unlockedThemes: user.unlockedThemes || ['default'],
            bio: user.bio,
            avatar: user.avatar
        });
    } catch (err) {
        res.status(500).json({ error: "Login error" });
    }
});

app.get('/api/users/profile/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username })
                               .select('username bio status lastSeen activeTheme avatar');
        if (!user) return res.status(404).json({ error: "NOT_FOUND" });
        res.json(user);
    } catch (err) { res.status(500).json({ error: "CORE_ERR" }); }
});

app.post('/api/users/update-profile', async (req, res) => {
    try {
        const { username, bio, avatar } = req.body;
        await User.findOneAndUpdate({ username }, { bio, avatar });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "UPDATE_ERR" }); }
});

app.get('/api/users/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);
        const users = await User.find({ 
            username: { $regex: `^${query}`, $options: 'i' } 
        })
        .limit(5)
        .select('username role status avatar');
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
    let connectedUser = null;

    socket.on('join_room', async (data) => {
        const room = typeof data === 'string' ? data : data.room;
        const userHandle = typeof data === 'object' ? data.username : null;

        if (userHandle) {
            connectedUser = userHandle;
            socket.join(userHandle);
            await User.findOneAndUpdate({ username: userHandle }, { status: "ONLINE" });
            io.emit('user_status_change', { username: userHandle, status: "ONLINE" });
        }

        socket.rooms.forEach(r => {
            if (r !== socket.id && r !== userHandle && r !== room) socket.leave(r);
        });

        socket.join(room);
        const messages = await Message.find({ room: room || 'global' }).sort({ timestamp: 1 }).limit(50);
        socket.emit('load_messages', messages);
    });

    socket.on('disconnect', async () => {
        if (connectedUser) {
            await User.findOneAndUpdate({ username: connectedUser }, { status: "OFFLINE", lastSeen: new Date() });
            io.emit('user_status_change', { username: connectedUser, status: "OFFLINE" });
        }
    });

    socket.on('send_message', async (data) => {
        try {
            const targetRoom = data.room || 'global';
            const newMessage = new Message({ 
                sender: data.user, 
                text: data.text || "", 
                gif: data.gif || "",
                room: targetRoom,
                isEncrypted: data.isEncrypted || false
            });
            const savedMessage = await newMessage.save();
            io.to(targetRoom).emit('receive_message', savedMessage); 

            if (targetRoom.includes("_DM_")) {
                const parts = targetRoom.split("_DM_");
                const recipient = parts.find(p => p !== data.user);
                io.to(recipient).emit('incoming_dm_alert', {
                    from: data.user,
                    room: targetRoom,
                    text: data.isEncrypted ? "SECURED_SIGNAL" : (data.text || "Attached Media")
                });
            }

            const updatedUser = await User.findOneAndUpdate({ username: data.user }, { $inc: { coins: 0.01 } }, { new: true });
            if (updatedUser) socket.emit('coin_update', updatedUser.coins);
        } catch (err) { console.error("SEND_ERROR:", err); }
    });

    // ... (Delete and Purge logic remain the same)
    socket.on('delete_message', async (data) => {
        try {
            const { messageId, username } = data;
            const msg = await Message.findById(messageId);
            const user = await User.findOne({ username });
            if (msg && user && (msg.sender === username || user.role === 'admin' || username === 'iloveshirin')) {
                await Message.findByIdAndDelete(messageId);
                io.to(msg.room).emit('message_deleted', messageId);
            }
        } catch (err) { console.error(err); }
    });

    socket.on('clear_all_messages', async (username) => {
        try {
            const user = await User.findOne({ username });
            if (user && (user.role === 'admin' || username === 'iloveshirin')) {
                await Message.deleteMany({});
                io.emit('chat_cleared');
            }
        } catch (err) { console.error(err); }
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
        } catch (err) { console.error(err); }
    });

    socket.on('admin_grant_coins', async ({ username }) => {
        try {
            if (username === 'iloveshirin') {
                const updatedUser = await User.findOneAndUpdate({ username }, { $inc: { coins: 100 } }, { new: true });
                if (updatedUser) socket.emit('coin_update', updatedUser.coins);
            }
        } catch (err) { console.error(err); }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`019_PROTOCOL_ONLINE_ON_PORT_${PORT}`);
});