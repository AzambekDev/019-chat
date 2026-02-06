"use client";

import { useState, useEffect, useRef } from "react";
import { socket } from "@/lib/socket";

export default function Home() {
  // --- STATES ---
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false); // Toggle for Login/Register
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<{ sender: string; text: string; time?: string }[]>([]);
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- 1. PERSISTENCE & SOCKET SETUP ---
  useEffect(() => {
    setMounted(true);
    
    const savedUser = localStorage.getItem("019_operator_name");
    const token = localStorage.getItem("019_token");

    if (savedUser && token) {
      setUsername(savedUser);
      setIsLoggedIn(true);
      socket.connect();
    }

    socket.on("load_messages", (messages) => setChat(messages));
    socket.on("receive_message", (data) => {
      setChat((prev) => [...prev, data]);
    });

    return () => {
      socket.off("load_messages");
      socket.off("receive_message");
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // --- 2. AUTH FUNCTIONS ---
  const handleAuth = async () => {
    const endpoint = isRegistering ? "register" : "login";
    try {
      const res = await fetch(`https://zero19-chat.onrender.com/api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (isRegistering) {
          alert("REGISTRATION_SUCCESSFUL // PLEASE_LOGIN");
          setIsRegistering(false);
          setPassword("");
        } else {
          localStorage.setItem("019_token", data.token);
          localStorage.setItem("019_operator_name", data.username);
          setIsLoggedIn(true);
          socket.connect();
        }
      } else {
        alert(`ACCESS_DENIED: ${data.error || "INVALID_CREDENTIALS"}`);
      }
    } catch (err) {
      console.error("Auth Error:", err);
      alert("CONNECTION_FAILURE_TO_CORE");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("019_operator_name");
    localStorage.removeItem("019_token");
    window.location.reload();
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      socket.emit("send_message", { user: username, text: message });
      setMessage("");
    }
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-black text-green-500 font-mono p-4 flex flex-col items-center justify-center">
      {!isLoggedIn ? (
        /* --- AUTH SCREEN --- */
        <div className="border border-green-900 p-8 bg-zinc-950 rounded-lg shadow-2xl w-full max-w-md">
          <h1 className="text-2xl mb-2 tracking-tighter uppercase font-bold text-center">
            {isRegistering ? "Register_New_Operator" : "Protocol_019 // Auth"}
          </h1>
          <p className="text-[10px] text-green-800 mb-6 text-center tracking-[0.2em]">SECURE_TERMINAL_v2.0</p>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="OPERATOR_HANDLE"
              className="bg-black border border-green-800 p-3 w-full text-green-500 focus:outline-none focus:border-green-400 placeholder:text-green-900"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="SECURE_PASSCODE"
              className="bg-black border border-green-800 p-3 w-full text-green-500 focus:outline-none focus:border-green-400 placeholder:text-green-900"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              onClick={handleAuth}
              className="w-full bg-green-900 hover:bg-green-700 text-black font-bold p-3 transition-all uppercase"
            >
              {isRegistering ? "Create_Identity" : "Initialize_Link"}
            </button>
            
            <button 
              onClick={() => setIsRegistering(!isRegistering)}
              className="w-full text-[10px] text-zinc-500 hover:text-green-500 transition-colors uppercase mt-2"
            >
              {isRegistering ? "Back to Login" : "No Identity? Register Here"}
            </button>
          </div>
        </div>
      ) : (
        /* --- CHAT INTERFACE --- */
        <div className="w-full max-w-2xl h-[85vh] border border-zinc-800 bg-zinc-950 flex flex-col rounded-lg overflow-hidden shadow-2xl">
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
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chat.map((msg, index) => (
              <div key={index} className={`flex flex-col ${msg.sender === username ? "items-end" : "items-start"}`}>
                <span className="text-[10px] text-zinc-500 mb-1 uppercase tracking-tighter">{msg.sender}</span>
                <div className={`p-3 rounded-lg max-w-[80%] break-words ${
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
              className="flex-1 bg-black border border-zinc-800 p-3 focus:outline-none focus:border-green-800 text-green-500 placeholder:text-zinc-700"
              placeholder="Type transmission..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button type="submit" className="bg-green-900 px-6 font-bold hover:bg-green-700 transition-all text-black uppercase">
              Send
            </button>
          </form>
        </div>
      )}
    </main>
  );
}