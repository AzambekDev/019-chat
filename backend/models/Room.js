const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true },
    members: [{ type: String }], // Array of usernames
    isPrivate: { type: Boolean, default: false }
});

module.exports = mongoose.model('Room', RoomSchema);