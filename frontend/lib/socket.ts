import { io } from "socket.io-client";

// This tells the frontend where the backend server is living
const SOCKET_URL = "https://zero19-chat.onrender.com";

export const socket = io(SOCKET_URL, {
    autoConnect: false,
});