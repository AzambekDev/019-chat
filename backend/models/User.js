const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'iloveshirin' }, // 'user' or 'admin'
    coins: { type: Number, default: 0 }, // Added: coins field
    activeTheme: { type: String, default: 'default' }, //Active themes
    unlockedThemes: { type: [String], default: ['default'] } //Unlocked Themes
});

module.exports = mongoose.model('User', UserSchema);