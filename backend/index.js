const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// 1. IMPORT MODELS
const Message = require('./models/Message'); 
const User = require('./models/User');

// 2. INITIALIZE THE APP (This must happen BEFORE app.use)
const app = express();

// 3. MIDDLEWARE
app.use(express.json()); // Now 'app' exists, so this works!
app.use(cors({
    origin: "https://019-chat.vercel.app",
    methods: ["GET", "POST"]
}));

// 4. AUTH ROUTES
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
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
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: "Login error" });
    }
});

// 5. CREATE HTTP & SOCKET SERVERS
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://019-chat.vercel.app",
        methods: ["GET", "POST"]
    }
});

// 6. DATABASE CONNECTION
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("--- 019_DATABASE_CONNECTED ---"))
    .catch(err => console.error("DB_ERROR:", err));

// 7. SOCKET LOGIC
io.on('connection', (socket) => {
    console.log(`LINK_ESTABLISHED: ${socket.id}`);

    Message.find().sort({ timestamp: 1 }).limit(50).then(messages => {
        socket.emit('load_messages', messages);
    });

    socket.on('send_message', async (data) => {
        try {
            const newMessage = new Message({ sender: data.user, text: data.text });
            await newMessage.save();
            io.emit('receive_message', {
                sender: newMessage.sender,
                text: newMessage.text,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } catch (err) {
            console.error("TX_ERR:", err);
        }
    });
});

// 8. START
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`019_PROTOCOL_ONLINE_ON_PORT_${PORT}`);
});