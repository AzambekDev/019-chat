import { io } from "socket.io-client";

// Ensure this matches your Render URL exactly
const SOCKET_URL = "https://zero19-chat.onrender.com";

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket'], // This forces a direct connection
});