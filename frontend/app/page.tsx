"use client";

import { useState, useEffect, useRef, CSSProperties } from "react";
import { socket } from "@/lib/socket";

// --- TYPESCRIPT INTERFACES ---
interface Message {
  sender: string;
  text?: string;
  gif?: string;
  room?: string;
  _id?: string;
  id?: string;
}

interface Theme {
  id: string;
  name: string;
  cost: number;
  color: string;
}

interface UserResult {
  username: string;
  role: string;
}

// --- CONFIG DATA ---
const THEMES: Theme[] = [
  { id: 'default', name: 'MATRIX_GREEN', cost: 0, color: '#22c55e' },
  { id: 'blood', name: 'BLOOD_PROTOCOL', cost: 5.0, color: '#ef4444' },
  { id: 'cobalt', name: 'COBALT_STRIKE', cost: 10.0, color: '#3b82f6' },
  { id: 'gold', name: 'ELITE_GOLD', cost: 50.0, color: '#eab308' },
];

const CHANNELS = ["global", "dev-ops", "intel"];

export default function Home() {
  // --- CORE STATES ---
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [coins, setCoins] = useState<number>(0);
  
  // --- ROOM & NOTIFICATION STATES ---
  const [currentRoom, setCurrentRoom] = useState<string>("global");
  const [activeDMs, setActiveDMs] = useState<string[]>([]); // Tracks usernames you are currently DMing
  const [notifications, setNotifications] = useState<Record<string, number>>({}); 
  const [chat, setChat] = useState<Message[]>([]);
  const [message, setMessage] = useState<string>("");

  // --- UI STATES ---
  const [showShop, setShowShop] = useState<boolean>(false);
  const [activeTheme, setActiveTheme] = useState<string>('default');
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>(['default']);
  const [showGifs, setShowGifs] = useState<boolean>(false);
  const [gifSearch, setGifSearch] = useState<string>("");
  const [gifs, setGifs] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState<string>("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const themeColor = THEMES.find(t => t.id === activeTheme)?.color || '#22c55e';

  // --- 1. SOCKET HANDLERS ---
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
      if (data.room === currentRoom || (!data.room && currentRoom === "global")) {
        setChat((prev) => [...prev, data]);
      }
    });

    // --- DM ALERT LISTENER ---
    socket.on("incoming_dm_alert", (data: { from: string, room: string, text: string }) => {
      if (currentRoom !== data.room) {
        // 1. Add sender to active DMs if not there
        setActiveDMs(prev => prev.includes(data.from) ? prev : [...prev, data.from]);
        
        // 2. Increment notification count
        setNotifications(prev => ({
          ...prev,
          [data.room]: (prev[data.room] || 0) + 1
        }));
      }
    });

    socket.on("coin_update", (newBalance: number) => setCoins(newBalance));
    socket.on("theme_unlocked", (data: { unlocked: string[], active: string }) => {
      setUnlockedThemes(data.unlocked);
      setActiveTheme(data.active);
    });
    socket.on("message_deleted", (id: string) => setChat((prev) => prev.filter((msg) => (msg._id || msg.id) !== id)));
    socket.on("chat_cleared", () => setChat([]));

    return () => {
      socket.off("load_messages");
      socket.off("receive_message");
      socket.off("incoming_dm_alert");
      socket.off("coin_update");
      socket.off("theme_unlocked");
      socket.off("message_deleted");
      socket.off("chat_cleared");
    };
  }, [currentRoom]);

  // Handle Room Switching & Personal Room Joining
  useEffect(() => {
    if (isLoggedIn) {
      // Pass both current room and username to backend for handshake
      socket.emit("join_room", { room: currentRoom, username: username });
      
      // Clear notifications for the room we just entered
      if (notifications[currentRoom]) {
        setNotifications(prev => ({ ...prev, [currentRoom]: 0 }));
      }
    }
  }, [currentRoom, isLoggedIn, username]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, showShop]);

  // --- 2. LOGIC FUNCTIONS ---
  
  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handlePurchase = (themeId: string, cost: number) => {
    socket.emit('purchase_theme', { username, themeId, cost });
  };

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
          setIsRegistering(false);
          alert("REGISTRATION_SUCCESSFUL");
        } else {
          localStorage.setItem("019_token", data.token);
          localStorage.setItem("019_operator_name", data.username);
          localStorage.setItem("019_role", data.role);
          setCoins(data.coins || 0);
          setUnlockedThemes(data.unlockedThemes || ['default']);
          setActiveTheme(data.activeTheme || 'default');
          setIsLoggedIn(true);
          socket.connect();
        }
      }
    } catch (err) { console.error(err); }
  };

  const handleUserSearch = async (val: string) => {
    setUserSearch(val);
    if (val.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`https://zero19-chat.onrender.com/api/users/search?query=${val}`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) { console.error("SEARCH_ERR", err); }
  };

  const startPrivateChat = (targetUser: string) => {
    const roomId = [username, targetUser].sort().join("_DM_");
    setActiveDMs(prev => prev.includes(targetUser) ? prev : [...prev, targetUser]);
    setCurrentRoom(roomId);
    setUserSearch("");
    setSearchResults([]);
    setShowShop(false);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      if (message.trim() === "/sys_grant_100" && (username === 'iloveshirin' || localStorage.getItem("019_role") === "admin")) {
        socket.emit("admin_grant_coins", { username });
        setMessage("");
        return;
      }
      socket.emit("send_message", { user: username, text: message, gif: "", room: currentRoom });
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
    } catch (err) { console.error("Giphy Search Failure:", err); }
  };

  const sendGif = (url: string) => {
    socket.emit("send_message", { user: username, text: "", gif: url, room: currentRoom });
    setShowGifs(false);
  };

  if (!mounted) return null;

  return (
    <main className="fixed inset-0 bg-[#050505] flex items-center justify-center p-2 sm:p-4 overflow-hidden" style={{ color: themeColor } as CSSProperties}>
      {!isLoggedIn ? (
        /* --- AUTH SCREEN --- */
        <div className="w-full max-w-sm border bg-black p-8 rounded-sm shadow-2xl" style={{ borderColor: themeColor } as CSSProperties}>
          <div className="text-center mb-8 uppercase tracking-widest">
            <h1 className="text-3xl font-black italic tracking-tighter">Protocol_019</h1>
            <p className="text-[9px] opacity-50 mt-1">Encrypted_Access_Only</p>
          </div>
          <div className="space-y-4">
            <input className="w-full bg-transparent border-b p-2 outline-none text-sm focus:brightness-150 transition-all" style={{ borderColor: themeColor } as CSSProperties} placeholder="OPERATOR_ID" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" 
                   className="w-full bg-transparent border-b p-2 outline-none text-sm" 
                   style={{ borderColor: themeColor } as CSSProperties} placeholder="SECURITY_KEY" 
                   value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={handleAuth} className="w-full text-black font-black py-3 uppercase text-sm mt-4 hover:brightness-110 transition-all" style={{ backgroundColor: themeColor } as CSSProperties}>
                {isRegistering ? "Register_Identity" : "Establish_Link"}
            </button>
            <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-[9px] text-zinc-600 hover:text-white uppercase tracking-widest mt-2">
                {isRegistering ? "Back to Login" : "No Identity? Request Entry"}
            </button>
          </div>
        </div>
      ) : (
        /* --- MAIN INTERFACE --- */
        <div className="w-full max-w-6xl h-[92vh] grid grid-cols-1 md:grid-cols-[260px_1fr] border border-zinc-900 bg-black rounded-sm overflow-hidden shadow-2xl">
          
          {/* SIDEBAR */}
          <div className="hidden md:flex flex-col border-r border-zinc-900 bg-[#080808] p-6 justify-between overflow-hidden">
            <div className="overflow-y-auto scrollbar-hide">
              <div className="mb-6">
                <h2 className="text-xl font-black tracking-tighter italic text-white uppercase leading-none">019_System</h2>
                <p className="text-2xl text-yellow-500 font-black tracking-tighter mt-2">{coins.toFixed(2)} ⌬</p>
              </div>

              {/* OPERATOR SEARCH */}
              <div className="mb-8">
                <p className="text-[9px] text-zinc-600 mb-2 uppercase tracking-widest font-bold">Search_Operators</p>
                <input 
                  className="w-full bg-[#111] border border-zinc-800 p-2 text-[10px] outline-none transition-all text-white focus:border-zinc-500"
                  placeholder="FIND_HANDLE..."
                  value={userSearch}
                  onChange={(e) => handleUserSearch(e.target.value)}
                />
                {searchResults.length > 0 && (
                  <div className="mt-2 border border-zinc-800 bg-black max-h-32 overflow-y-auto shadow-xl">
                    {searchResults.map(u => (
                      <button 
                        key={u.username}
                        onClick={() => startPrivateChat(u.username)}
                        className="w-full text-left p-2 text-[10px] hover:bg-zinc-900 border-b border-zinc-900 last:border-0 uppercase font-bold"
                      >
                        {u.username}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CHANNELS */}
              <div className="space-y-1 mb-6">
                <p className="text-[9px] text-zinc-600 mb-2 uppercase tracking-widest font-bold">Channels</p>
                {CHANNELS.map((ch) => (
                  <button key={ch} onClick={() => { setShowShop(false); setCurrentRoom(ch); }} 
                          className={`w-full text-left text-[11px] p-2 transition-all uppercase font-bold flex justify-between items-center ${currentRoom === ch && !showShop ? 'bg-white/5 border-l-2' : 'opacity-40 hover:opacity-100 hover:translate-x-1'}`} 
                          style={{ borderColor: currentRoom === ch && !showShop ? themeColor : 'transparent' }}>
                    <span># {ch}</span>
                    {notifications[ch] > 0 && <span className="bg-red-600 text-white text-[8px] px-1 rounded-full animate-pulse">{notifications[ch]}</span>}
                  </button>
                ))}
              </div>

              {/* ACTIVE DMs */}
              {activeDMs.length > 0 && (
                <div className="space-y-1 mb-6">
                  <p className="text-[9px] text-zinc-600 mb-2 uppercase tracking-widest font-bold">Active_DMs</p>
                  {activeDMs.map((dmUser) => {
                    const dmRoomId = [username, dmUser].sort().join("_DM_");
                    return (
                      <button key={dmUser} onClick={() => { setShowShop(false); setCurrentRoom(dmRoomId); }} 
                              className={`w-full text-left text-[11px] p-2 transition-all uppercase font-bold flex justify-between items-center ${currentRoom === dmRoomId && !showShop ? 'bg-white/5 border-l-2' : 'opacity-40 hover:opacity-100 hover:translate-x-1'}`} 
                              style={{ borderColor: currentRoom === dmRoomId && !showShop ? themeColor : 'transparent' }}>
                        <span>@ {dmUser}</span>
                        {notifications[dmRoomId] > 0 && <span className="bg-red-600 text-white text-[8px] px-1 rounded-full animate-pulse">{notifications[dmRoomId]}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <button onClick={() => setShowShop(!showShop)} 
                      className="mt-4 w-full text-left text-[10px] font-black tracking-widest uppercase hover:text-white transition-all" 
                      style={{ color: showShop ? '#fff' : themeColor } as CSSProperties}>
                {showShop ? '[ CLOSE_STORE ]' : '[ ACCESS_STORE ]'}
              </button>
            </div>
            <button onClick={handleLogout} className="text-left text-[10px] text-red-900 hover:text-red-500 transition-all uppercase font-black tracking-widest">[ Terminate_Session ]</button>
          </div>

          {/* MAIN VIEW */}
          <div className="flex flex-col h-full bg-[#0a0a0a] relative overflow-hidden">
            <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-black/50 z-10 h-14">
              <div className="text-[9px] uppercase font-bold opacity-30 tracking-[0.2em]">
                Channel // {currentRoom.includes("_DM_") ? `SECURE_DM_ENCRYPTED` : currentRoom.toUpperCase()}
              </div>
              {(username === 'iloveshirin' || localStorage.getItem("019_role") === 'admin') && (
                <button onClick={() => { if(confirm("PURGE?")) socket.emit("clear_all_messages", username) }} 
                        className="text-[9px] text-yellow-600 border border-yellow-900 px-3 py-1 rounded hover:bg-yellow-900 hover:text-black transition-all font-bold uppercase">Purge</button>
              )}
            </div>

            {showShop ? (
              /* --- STORE --- */
              <div className="flex-1 overflow-y-auto p-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-10">
                  {THEMES.map((t) => (
                    <div key={t.id} className="border border-zinc-800 p-6 bg-black flex flex-col justify-between hover:border-zinc-600 transition-all">
                      <div><h3 className="font-black text-lg italic uppercase" style={{ color: t.color } as CSSProperties}>{t.name}</h3><p className="text-[9px] text-zinc-500 mt-1">Cost: {t.cost.toFixed(2)} ⌬</p></div>
                      {unlockedThemes.includes(t.id) ? (
                        <button onClick={() => setActiveTheme(t.id)} className="mt-6 text-[10px] font-black py-2 border border-zinc-700 hover:bg-white hover:text-black transition-all uppercase">{activeTheme === t.id ? "ACTIVE" : "EQUIP"}</button>
                      ) : (
                        <button onClick={() => handlePurchase(t.id, t.cost)} disabled={coins < t.cost} 
                                className={`mt-6 text-[10px] font-black py-2 border uppercase ${coins >= t.cost ? "border-yellow-600 text-yellow-600 hover:bg-yellow-600 hover:text-black" : "border-zinc-900 text-zinc-800 cursor-not-allowed"}`}>Buy</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* --- CHAT --- */
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800">
                {chat.map((msg, index) => {
                  const isMe = msg.sender === username;
                  return (
                    <div key={msg._id || index} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div className="max-w-[85%] sm:max-w-[70%] group relative">
                        <span className={`text-[9px] text-zinc-600 uppercase mb-1.5 block font-bold tracking-tight ${isMe ? "text-right" : "text-left"}`}>{msg.sender}</span>
                        <div className={`p-4 rounded-sm transition-all relative bg-white/5 border-zinc-700 text-zinc-300`} 
                             style={{ borderRightWidth: isMe ? '2px' : '0px', borderLeftWidth: isMe ? '0px' : '2px', borderColor: isMe ? themeColor : '#3f3f46' } as CSSProperties}>
                          {msg.text && <p className="text-sm leading-relaxed font-medium">{msg.text}</p>}
                          {msg.gif && <img src={msg.gif} alt="gif" className="rounded-sm mt-3 w-full max-w-[280px]" />}
                          {(isMe || username === 'iloveshirin' || localStorage.getItem("019_role") === "admin") && (
                              <button onClick={() => socket.emit("delete_message", { messageId: msg._id, username: username })} className="absolute -top-2 -right-2 bg-red-600 text-white text-[8px] px-1.5 py-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity font-bold">DEL</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef} className="h-1" />
              </div>
            )}

            {!showShop && (
              <div className="p-4 bg-black/80 backdrop-blur-xl border-t border-zinc-900 mt-auto">
                {showGifs && (
                  <div className="mb-4 bg-[#0d0d0d] border border-zinc-800 p-4 rounded-sm shadow-2xl overflow-hidden">
                    <input className="w-full bg-black border border-zinc-800 p-2.5 text-xs outline-none transition-all mb-4" 
                           style={{ color: themeColor, borderColor: themeColor } as CSSProperties} 
                           placeholder="Search Giphy..." value={gifSearch} onChange={(e) => setGifSearch(e.target.value)} 
                           onKeyDown={(e) => e.key === 'Enter' && searchGifs()} />
                    <div className="grid grid-cols-3 gap-2 h-40 overflow-y-auto pr-2">
                        {gifs.map((g) => ( <img key={g.id} src={g.images.fixed_height_small.url} className="w-full h-24 object-cover cursor-pointer hover:scale-95 transition-transform border border-transparent hover:border-white" onClick={() => sendGif(g.images.fixed_height.url)} /> ))}
                    </div>
                  </div>
                )}
                <form onSubmit={sendMessage} className="flex gap-3 items-center">
                  <button type="button" onClick={() => setShowGifs(!showGifs)} className={`px-4 py-3 text-[10px] font-black border transition-all ${showGifs ? "text-black" : "text-zinc-500"}`} style={{ backgroundColor: showGifs ? themeColor : 'transparent', borderColor: showGifs ? themeColor : '#27272a', color: showGifs ? 'black' : 'inherit' } as CSSProperties}>GIF</button>
                  <input 
                    type="text" 
                    className="flex-1 bg-[#0f0f0f] border border-zinc-800 p-3 text-sm focus:outline-none transition-all text-white placeholder-zinc-800" 
                    onFocus={(e) => e.target.style.borderColor = themeColor} 
                    onBlur={(e) => e.target.style.borderColor = '#27272a'} 
                    placeholder={`Transmit to #${currentRoom}...`} 
                    value={message} 
                    onChange={(e) => setMessage(e.target.value)} 
                  />
                  <button type="submit" className="px-8 py-3 font-black text-[10px] uppercase tracking-widest text-black" style={{ backgroundColor: themeColor } as CSSProperties}>Execute</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}