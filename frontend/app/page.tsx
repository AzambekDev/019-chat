"use client";

import { useState, useEffect, useRef } from "react";
import { socket } from "@/lib/socket";

export default function Home() {
  // --- STATES ---
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<{ sender: string; text: string; time?: string }[]>([]);
  const [mounted, setMounted] = useState(false); // Fixes Next.js "window" errors
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- 1. PERSISTENCE LOGIC (Runs on startup) ---
  useEffect(() => {
    setMounted(true); // Tell Next.js we are now in the browser
    
    const savedUser = localStorage.getItem("019_operator_name");
    if (savedUser) {
      setUsername(savedUser);
      setIsLoggedIn(true);
      socket.connect();
    }

    // Listen for incoming messages
    socket.on("load_messages", (messages) => setChat(messages));
    socket.on("receive_message", (data) => {
      setChat((prev) => [...prev, data]);
    });

    return () => {
      socket.off("load_messages");
      socket.off("receive_message");
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // --- 2. LOGIN & LOGOUT FUNCTIONS ---
  const handleLogin = () => {
    if (username.trim()) {
      localStorage.setItem("019_operator_name", username); // Save to browser
      setIsLoggedIn(true);
      socket.connect();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("019_operator_name"); // Wipe browser memory
    window.location.reload(); // Hard reset
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      socket.emit("send_message", { user: username, text: message });
      setMessage("");
    }
  };

  // Prevent hydration error (waits for browser to be ready)
  if (!mounted) return null;

  // --- 3. UI RENDERING ---
  return (
    <main className="min-h-screen bg-black text-green-500 font-mono p-4 flex flex-col items-center justify-center">
      {!isLoggedIn ? (
        /* --- LOGIN SCREEN --- */
        <div className="border border-green-900 p-8 bg-zinc-950 rounded-lg shadow-2xl">
          <h1 className="text-2xl mb-6 tracking-tighter uppercase font-bold">Protocol_019 // Auth</h1>
          <input
            type="text"
            placeholder="ENTER_OPERATOR_HANDLE"
            className="bg-black border border-green-800 p-3 w-full mb-4 text-green-500 focus:outline-none focus:border-green-400"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button
            onClick={handleLogin}
            className="w-full bg-green-900 hover:bg-green-700 text-black font-bold p-3 transition-all"
          >
            INITIALIZE_LINK
          </button>
        </div>
      ) : (
        /* --- CHAT INTERFACE --- */
        <div className="w-full max-w-2xl h-[80vh] border border-zinc-800 bg-zinc-950 flex flex-col rounded-lg overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-black/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs uppercase tracking-widest">System_Online // {username}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="text-[10px] bg-red-950/30 border border-red-900 text-red-500 px-3 py-1 rounded hover:bg-red-900 hover:text-white transition-all"
            >
              [ TERMINATE_SESSION ]
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
            {chat.map((msg, index) => (
              <div key={index} className={`flex flex-col ${msg.sender === username ? "items-end" : "items-start"}`}>
                <span className="text-[10px] text-zinc-500 mb-1">{msg.sender}</span>
                <div className={`p-3 rounded-lg max-w-[80%] ${
                  msg.sender === username ? "bg-green-900/20 border border-green-800 text-green-400" : "bg-zinc-900 border border-zinc-800 text-zinc-300"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={sendMessage} className="p-4 border-t border-zinc-800 bg-black/50 flex gap-2">
            <input
              type="text"
              className="flex-1 bg-black border border-zinc-800 p-3 focus:outline-none focus:border-green-800 text-green-500"
              placeholder="Type transmission..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button type="submit" className="bg-green-900 px-6 font-bold hover:bg-green-700 transition-all text-black">
              SEND
            </button>
          </form>
        </div>
      )}
    </main>
  );
}