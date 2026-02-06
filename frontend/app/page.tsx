"use client";

import { useState, useEffect, useRef } from "react";
import { socket } from "@/lib/socket";

// --- TYPESCRIPT INTERFACES ---
interface Message {
  sender: string;
  text?: string;
  gif?: string;
  _id?: string;
  id?: string;
}

export default function Home() {
  // --- STATES ---
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [chat, setChat] = useState<Message[]>([]);
  const [mounted, setMounted] = useState<boolean>(false);
  
  // --- GIPHY STATES ---
  const [showGifs, setShowGifs] = useState<boolean>(false);
  const [gifSearch, setGifSearch] = useState<string>("");
  const [gifs, setGifs] = useState<any[]>([]);

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

    socket.on("load_messages", (messages: Message[]) => setChat(messages));
    socket.on("receive_message", (data: Message) => {
      // DEBUG: Verify the data structure arriving from the backend
      console.log("019_TRANSMISSION_RECEIVED:", data);
      setChat((prev) => [...prev, data]);
    });

    socket.on("message_deleted", (id: string) => {
      setChat((prev) => prev.filter((msg) => (msg._id || msg.id) !== id));
    });

    socket.on("chat_cleared", () => {
      setChat([]);
    });

    return () => {
      socket.off("load_messages");
      socket.off("receive_message");
      socket.off("message_deleted");
      socket.off("chat_cleared");
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // --- 2. AUTH & CHAT FUNCTIONS ---
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
          localStorage.setItem("019_role", data.role);
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
    localStorage.clear();
    window.location.reload();
  };

  // --- SOCKET EMITTER FIX (TEXT) ---
  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      // FIX: Explicitly send an empty gif string so the database schema remains valid
      socket.emit("send_message", { 
        user: username, 
        text: message, 
        gif: "" 
      });
      setMessage("");
    }
  };

  // --- GIPHY LOGIC ---
  const searchGifs = async () => {
    if (!gifSearch.trim()) return;
    const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_KEY;
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${gifSearch}&limit=12&rating=g`);
      const { data } = await res.json();
      setGifs(data);
    } catch (err) {
      console.error("Giphy Error:", err);
    }
  };

  // --- SOCKET EMITTER FIX (GIF) ---
  const sendGif = (url: string) => {
    // FIX: Send an empty text string to ensure the message is accepted by the backend
    socket.emit("send_message", { 
      user: username, 
      text: "", 
      gif: url 
    });
    setShowGifs(false);
    setGifSearch("");
    setGifs([]);
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
              className="bg-black border border-green-800 p-3 w-full text-green-500 focus:outline-none focus:border-green-400"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="SECURE_PASSCODE"
              className="bg-black border border-green-800 p-3 w-full text-green-500 focus:outline-none focus:border-green-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={handleAuth} className="w-full bg-green-900 hover:bg-green-700 text-black font-bold p-3 transition-all uppercase">
              {isRegistering ? "Create_Identity" : "Initialize_Link"}
            </button>
            <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-[10px] text-zinc-500 hover:text-green-500 uppercase mt-2">
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
            <div className="flex gap-2">
              {(username === 'iloveshirin' || localStorage.getItem("019_role") === 'admin') && (
                <button 
                  onClick={() => socket.emit("clear_all_messages", username)}
                  className="text-[10px] bg-yellow-950/20 border border-yellow-700 text-yellow-600 px-3 py-1 rounded hover:bg-yellow-700 hover:text-black transition-all"
                >
                  [ PURGE ]
                </button>
              )}
              <button onClick={handleLogout} className="text-[10px] bg-red-950/30 border border-red-900 text-red-500 px-3 py-1 rounded hover:bg-red-900">
                [ TERMINATE ]
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chat.map((msg, index) => (
              <div key={msg._id || index} className={`flex flex-col ${msg.sender === username ? "items-end" : "items-start"}`}>
                <span className="text-[10px] text-zinc-500 mb-1 uppercase tracking-tighter">{msg.sender}</span>
                <div className="relative group max-w-[80%] flex items-center gap-2">
                  {(msg.sender === username || username === 'iloveshirin' || localStorage.getItem("019_role") === "admin") && (
                    <button 
                      onClick={() => socket.emit("delete_message", { messageId: msg._id, username: username })}
                      className="opacity-0 group-hover:opacity-100 text-red-500 text-[9px] border border-red-900 px-1 rounded hover:bg-red-900 transition-all h-fit"
                    >
                      DEL
                    </button>
                  )}
                  <div className={`p-3 rounded-lg break-words ${
                    msg.sender === username ? "bg-green-900/20 border border-green-800 text-green-400" : "bg-zinc-900 border border-zinc-800 text-zinc-300"
                  }`}>
                    {msg.text && <p>{msg.text}</p>}
                    {/* Render GIF if present */}
                    {msg.gif && (
                        <img 
                          src={msg.gif} 
                          alt="gif" 
                          className="rounded mt-2 max-w-full border border-green-900/30 shadow-lg" 
                        />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>

          {/* GIF Picker Overlay */}
          {showGifs && (
            <div className="mx-4 mb-2 p-3 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
               <div className="flex gap-2 mb-3">
                  <input 
                    className="flex-1 bg-black border border-zinc-700 p-2 text-xs text-green-500 focus:outline-none"
                    placeholder="SEARCH_GIPHY..."
                    value={gifSearch}
                    onChange={(e) => setGifSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchGifs()}
                  />
                  <button onClick={searchGifs} className="bg-green-900 text-black px-3 text-xs font-bold">FETCH</button>
               </div>
               <div className="grid grid-cols-3 gap-2">
                  {gifs.map((g) => (
                    <img 
                      key={g.id} 
                      src={g.images.fixed_height_small.url} 
                      className="cursor-pointer hover:opacity-70 transition-all rounded border border-zinc-800"
                      onClick={() => sendGif(g.images.fixed_height.url)}
                    />
                  ))}
               </div>
            </div>
          )}

          {/* Input Area */}
          <form onSubmit={sendMessage} className="p-4 border-t border-zinc-800 bg-black/50 flex gap-2 items-center">
            <button 
              type="button"
              onClick={() => setShowGifs(!showGifs)}
              className={`px-3 py-2 border text-[10px] transition-all font-bold ${showGifs ? "bg-green-900 text-black border-green-400" : "bg-zinc-900 text-green-700 border-zinc-700 hover:text-green-500"}`}
            >
              GIF
            </button>
            <input
              type="text"
              className="flex-1 bg-black border border-zinc-800 p-3 focus:outline-none focus:border-green-800 text-green-500"
              placeholder="Type transmission..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button type="submit" className="bg-green-900 px-6 py-3 font-bold hover:bg-green-700 text-black uppercase text-sm">
              Send
            </button>
          </form>
        </div>
      )}
    </main>
  );
}