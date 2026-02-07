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
  const [coins, setCoins] = useState<number>(0);
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
      if (!socket.connected) socket.connect();
    }

    socket.on("load_messages", (messages: Message[]) => setChat(messages));
    socket.on("receive_message", (data: Message) => {
      setChat((prev) => {
        const exists = prev.some(m => m._id === data._id && data._id !== undefined);
        return exists ? prev : [...prev, data];
      });
    });
    socket.on("coin_update", (newBalance: number) => setCoins(newBalance));
    socket.on("message_deleted", (id: string) => {
      setChat((prev) => prev.filter((msg) => (msg._id || msg.id) !== id));
    });
    socket.on("chat_cleared", () => setChat([]));

    return () => {
      socket.off("load_messages");
      socket.off("receive_message");
      socket.off("coin_update");
      socket.off("message_deleted");
      socket.off("chat_cleared");
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
          localStorage.setItem("019_role", data.role);
          setCoins(data.coins || 0);
          setIsLoggedIn(true);
          socket.connect();
        }
      } else {
        alert(`ACCESS_DENIED: ${data.error || "INVALID_CREDENTIALS"}`);
      }
    } catch (err) {
      alert("CONNECTION_FAILURE_TO_CORE");
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      socket.emit("send_message", { user: username, text: message, gif: "" });
      setMessage("");
    }
  };

  const searchGifs = async () => {
    if (!gifSearch.trim()) return;
    const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_KEY;
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${gifSearch}&limit=12&rating=g`);
      const { data } = await res.json();
      setGifs(data);
    } catch (err) {
      console.error("Giphy Search Failure:", err);
    }
  };

  const sendGif = (url: string) => {
    if (!url) return;
    socket.emit("send_message", { user: username, text: "", gif: url });
    setShowGifs(false);
    setGifSearch("");
    setGifs([]);
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-[#050505] text-green-500 font-mono flex items-center justify-center p-2 sm:p-4">
      {!isLoggedIn ? (
        /* --- AUTH SCREEN --- */
        <div className="w-full max-w-sm border border-green-900 bg-black p-8 rounded-sm shadow-[0_0_40px_rgba(0,255,0,0.05)]">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black italic tracking-tighter uppercase">Protocol_019</h1>
            <p className="text-[9px] tracking-[0.4em] text-green-900 uppercase mt-1">Encrypted_Access_Only</p>
          </div>
          <div className="space-y-4">
            <input className="w-full bg-transparent border-b border-green-900 p-2 focus:border-green-500 outline-none transition-all text-sm" placeholder="OPERATOR_ID" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" className="w-full bg-transparent border-b border-green-900 p-2 focus:border-green-500 outline-none transition-all text-sm" placeholder="SECURITY_KEY" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={handleAuth} className="w-full bg-green-500 text-black font-black py-3 hover:bg-green-400 transition-all uppercase text-sm mt-4 shadow-[0_0_15px_rgba(0,255,0,0.2)]">
              {isRegistering ? "Register_Identity" : "Establish_Link"}
            </button>
            <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-[9px] text-zinc-600 hover:text-green-700 uppercase tracking-widest mt-2">
              {isRegistering ? "Back to Login" : "No Identity? Request Entry"}
            </button>
          </div>
        </div>
      ) : (
        /* --- MAIN INTERFACE --- */
        <div className="w-full max-w-6xl h-[92vh] grid grid-cols-1 md:grid-cols-[260px_1fr] border border-zinc-900 bg-black rounded-sm overflow-hidden shadow-2xl">
          
          {/* SIDEBAR */}
          <div className="hidden md:flex flex-col border-r border-zinc-900 bg-[#080808] p-6 justify-between">
            <div>
              <div className="mb-10">
                <h2 className="text-xl font-black tracking-tighter italic text-white">019_PROTOCOL</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_green]"></span>
                  <span className="text-[10px] text-green-800 tracking-widest uppercase font-bold">Terminal_Active</span>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <p className="text-[9px] text-zinc-600 mb-1 uppercase tracking-widest font-bold">Operator</p>
                  <p className="text-sm text-white font-black truncate border-l-2 border-green-600 pl-2">{username}</p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-600 mb-1 uppercase tracking-widest font-bold">Network_Balance</p>
                  <p className="text-2xl text-yellow-500 font-black tracking-tighter leading-none">{coins.toFixed(2)} <span className="text-xs ml-1">⌬</span></p>
                </div>
              </div>
            </div>

            <button onClick={handleLogout} className="text-left text-[10px] text-red-900 hover:text-red-500 transition-all uppercase font-black tracking-widest">
              [ Terminate_Session ]
            </button>
          </div>

          {/* CHAT AREA */}
          <div className="flex flex-col h-full bg-[#0a0a0a] relative">
            {/* Header Mobile Only */}
            <div className="md:hidden p-4 border-b border-zinc-900 flex justify-between items-center bg-black">
                <span className="text-xs font-black text-white uppercase">{username}</span>
                <span className="text-xs text-yellow-500 font-black">{coins.toFixed(2)} ⌬</span>
            </div>

            {/* Messages Pane */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800">
              {chat.map((msg, index) => {
                const isMe = msg.sender === username;
                return (
                  <div key={msg._id || index} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className="max-w-[85%] sm:max-w-[70%] group relative">
                      <span className={`text-[9px] text-zinc-600 uppercase mb-1.5 block font-bold tracking-tight ${isMe ? "text-right" : "text-left"}`}>
                        {msg.sender}
                      </span>
                      
                      <div className={`p-4 rounded-sm transition-all relative ${
                        isMe 
                        ? "bg-green-500/5 border-r-2 border-green-500 text-green-100" 
                        : "bg-white/5 border-l-2 border-zinc-700 text-zinc-300"
                      }`}>
                        {msg.text && <p className="text-sm leading-relaxed antialiased font-medium">{msg.text}</p>}
                        {msg.gif && <img src={msg.gif} alt="gif" className="rounded-sm mt-3 w-full max-w-[280px] opacity-90 border border-white/10" />}
                        
                        {(isMe || username === 'iloveshirin' || localStorage.getItem("019_role") === "admin") && (
                            <button 
                                onClick={() => socket.emit("delete_message", { messageId: msg._id, username: username })}
                                className="absolute -top-2 -right-2 bg-red-600 text-white text-[8px] px-1.5 py-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity font-bold"
                            >
                                DEL
                            </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>

            {/* Input & GIF UI */}
            <div className="p-4 bg-black/80 backdrop-blur-xl border-t border-zinc-900">
              {showGifs && (
                <div className="mb-4 bg-[#0d0d0d] border border-zinc-800 p-4 rounded-sm shadow-2xl">
                   <div className="flex gap-2 mb-4">
                      <input className="flex-1 bg-black border border-zinc-800 p-2.5 text-xs outline-none focus:border-green-600 text-green-500" placeholder="Search Giphy..." value={gifSearch} onChange={(e) => setGifSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchGifs()} />
                   </div>
                   <div className="grid grid-cols-3 gap-2 h-48 overflow-y-auto">
                      {gifs.map((g) => (
                        <img key={g.id} src={g.images.fixed_height_small.url} className="w-full h-24 object-cover cursor-pointer hover:scale-95 transition-transform rounded-sm border border-transparent hover:border-green-500" onClick={() => sendGif(g.images.fixed_height.url)} />
                      ))}
                   </div>
                </div>
              )}

              <form onSubmit={sendMessage} className="flex gap-3 items-center">
                <button type="button" onClick={() => setShowGifs(!showGifs)} className={`px-4 py-3 text-[10px] font-black border transition-all ${showGifs ? "bg-green-500 text-black border-green-500" : "bg-transparent border-zinc-800 text-zinc-500 hover:text-green-500 hover:border-green-500"}`}>
                  GIF
                </button>
                <input type="text" className="flex-1 bg-[#0f0f0f] border border-zinc-800 p-3 text-sm focus:outline-none focus:border-green-900 transition-all text-white placeholder-zinc-800" placeholder="Type transmission..." value={message} onChange={(e) => setMessage(e.target.value)} />
                <button type="submit" className="bg-zinc-900 border border-zinc-700 px-8 py-3 font-black text-[10px] hover:bg-green-500 hover:text-black hover:border-green-500 transition-all uppercase tracking-widest">
                  Execute
                </button>
              </form>
            </div>

            {/* Admin Purge Button overlay for iloveshirin (Desktop only) */}
            {(username === 'iloveshirin' || localStorage.getItem("019_role") === 'admin') && (
              <button 
                onClick={() => { if(confirm("PERMANENT_PURGE?")) socket.emit("clear_all_messages", username) }}
                className="hidden md:block absolute top-4 right-4 text-[8px] text-yellow-900 border border-yellow-900 px-2 py-1 rounded hover:bg-yellow-900 hover:text-black transition-all font-bold uppercase tracking-tighter"
              >
                Purge_System
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}