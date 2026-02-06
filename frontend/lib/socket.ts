import { io } from "socket.io-client";

// This tells the frontend where the backend server is living
const SOCKET_URL = "http://localhost:3001";

export const socket = io(SOCKET_URL, {
    autoConnect: false,
});