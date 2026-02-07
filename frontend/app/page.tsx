"use client";

import { useState, useEffect, useRef, CSSProperties } from "react";
import { socket } from "@/lib/socket";

// --- TYPESCRIPT INTERFACES ---
interface Message {
  sender: string;
  text?: string;
  gif?: string;
  _id?: string;
  id?: string;
}

interface Theme {
  id: string;
  name: string;
  cost: number;
  color: string;
  bg?: string;
}

// --- THEME DATA ---
const THEMES: Theme[] = [
  { id: 'default', name: 'MATRIX_GREEN', cost: 0, color: '#22c55e' },
  { id: 'blood', name: 'BLOOD_PROTOCOL', cost: 5.0, color: '#ef4444' },
  { id: 'cobalt', name: 'COBALT_STRIKE', cost: 10.0, color: '#3b82f6' },
  { id: 'gold', name: 'ELITE_GOLD', cost: 50.0, color: '#eab308' },
];

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
  
  const [showShop, setShowShop] = useState<boolean>(false);
  const [activeTheme, setActiveTheme] = useState<string>('default');
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>(['default']);
  
  const [showGifs, setShowGifs] = useState<boolean>(false);
  const [gifSearch, setGifSearch] = useState<string>("");
  const [gifs, setGifs] = useState<any[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const themeColor = THEMES.find(t => t.id === activeTheme)?.color || '#22c55e';

  // --- 1.Handshake & Socket Listeners ---
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
    
    socket.on("theme_unlocked", (data: { unlocked: string[], active: string }) => {
      setUnlockedThemes(data.unlocked);
      setActiveTheme(data.active);
    });

    socket.on("message_deleted", (id: string) => {
      setChat((prev) => prev.filter((msg) => (msg._id || msg.id) !== id));
    });
    socket.on("chat_cleared", () => setChat([]));

    return () => {
      socket.off("load_messages");
      socket.off("receive_message");
      socket.off("coin_update");
      socket.off("theme_unlocked");
      socket.off("message_deleted");
      socket.off("chat_cleared");
    };
  }, []);

  // Strict scrolling logic for chat area only
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat, showShop]);

  // --- 2. Auth & Core Actions ---
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
          alert("REGISTRATION_SUCCESSFUL");
          setIsRegistering(false);
          setPassword("");
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
      } else {
        alert(`ACCESS_DENIED: ${data.error}`);
      }
    } catch (err) {
      alert("CONNECTION_FAILURE");
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMsg = message.trim();
    if (trimmedMsg) {
      // --- HIDDEN ADMIN COMMAND ---
      if (trimmedMsg === "/sys_grant_100" && (username === 'iloveshirin' || localStorage.getItem("019_role") === "admin")) {
        socket.emit("admin_grant_coins", { username });
        setMessage("");
        return;
      }

      socket.emit("send_message", { user: username, text: trimmedMsg, gif: "" });
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

  const handlePurchase = (themeId: string, cost: number) => {
    socket.emit('purchase_theme', { username, themeId, cost });
  };

  if (!mounted) return null;

  return (
    <main className="fixed inset-0 bg-[#050505] flex items-center justify-center p-2 sm:p-4 overflow-hidden" style={{ color: themeColor } as CSSProperties}>
      {!isLoggedIn ? (
        /* --- AUTH SCREEN --- */
        <div className="w-full max-w-sm border bg-black p-8 rounded-sm shadow-2xl" style={{ borderColor: themeColor } as CSSProperties}>
          <div className="text-center mb-8 uppercase">
            <h1 className="text-3xl font-black italic tracking-tighter">Protocol_019</h1>
            <p className="text-[9px] tracking-[0.4em] opacity-50">Encrypted_Access_Only</p>
          </div>
          <div className="space-y-4">
            <input className="w-full bg-transparent border-b p-2 outline-none transition-all text-sm" style={{ borderColor: themeColor } as CSSProperties} placeholder="OPERATOR_ID" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" className="w-full bg-transparent border-b p-2 outline-none transition-all text-sm" style={{ borderColor: themeColor } as CSSProperties} placeholder="SECURITY_KEY" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={handleAuth} className="w-full text-black font-black py-3 uppercase text-sm mt-4 transition-all hover:brightness-125" style={{ backgroundColor: themeColor } as CSSProperties}>
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
            <div>
              <div className="mb-10">
                <h2 className="text-xl font-black tracking-tighter italic text-white uppercase leading-none">019_System</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]" style={{ backgroundColor: themeColor } as CSSProperties}></span>
                  <span className="text-[10px] tracking-widest uppercase font-bold opacity-70">Terminal_Active</span>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <p className="text-[9px] text-zinc-600 mb-1 uppercase tracking-widest font-bold">Operator</p>
                  <p className="text-sm text-white font-black truncate border-l-2 pl-2" style={{ borderColor: themeColor } as CSSProperties}>{username}</p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-600 mb-1 uppercase tracking-widest font-bold">Credits</p>
                  <p className="text-2xl text-yellow-500 font-black tracking-tighter leading-none">{coins.toFixed(2)} <span className="text-xs ml-1">⌬</span></p>
                </div>
              </div>

              <button 
                onClick={() => setShowShop(!showShop)}
                className="mt-12 w-full text-left text-[10px] font-black tracking-widest uppercase hover:brightness-150 transition-all"
                style={{ color: showShop ? '#fff' : themeColor } as CSSProperties}
              >
                {showShop ? '[ CLOSE_TERMINAL ]' : '[ ACCESS_STORE ]'}
              </button>
            </div>

            <button onClick={handleLogout} className="text-left text-[10px] text-red-900 hover:text-red-500 transition-all uppercase font-black tracking-widest">
              [ Terminate_Session ]
            </button>
          </div>

          {/* CHAT AREA */}
          <div className="flex flex-col h-full bg-[#0a0a0a] relative overflow-hidden">
            
            {/* TOP HEADER (Restore Purge Button) */}
            <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-black/50 z-10 h-14">
              <div className="md:hidden flex flex-col">
                <span className="text-xs font-black text-white uppercase leading-tight">{username}</span>
                <span className="text-[10px] text-yellow-500">{coins.toFixed(2)} ⌬</span>
              </div>
              <div className="hidden md:block text-[9px] uppercase font-bold opacity-30 italic tracking-[0.2em]">Protocol_Established // Secure_Handshake</div>
              
              {/* RESTORED PURGE BUTTON */}
              {(username === 'iloveshirin' || localStorage.getItem("019_role") === 'admin') && (
                <button 
                  onClick={() => { if(confirm("PERMANENT_SYSTEM_PURGE?")) socket.emit("clear_all_messages", username) }} 
                  className="text-[9px] text-yellow-600 border border-yellow-900 px-3 py-1 rounded hover:bg-yellow-900 hover:text-black transition-all font-bold uppercase"
                >
                  Purge_System
                </button>
              )}
            </div>

            {showShop ? (
              /* --- STORE VIEW --- */
              <div className="flex-1 overflow-y-auto p-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="mb-8">
                  <h2 className="text-2xl font-black italic tracking-tighter uppercase text-white">Extension_Store</h2>
                  <p className="text-[10px] text-zinc-500 tracking-widest mt-1 uppercase">Exchange credits for visual modules</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-10">
                  {THEMES.map((t) => (
                    <div key={t.id} className="border border-zinc-800 p-6 bg-black flex flex-col justify-between hover:border-zinc-600 transition-all">
                      <div>
                        <h3 className="font-black text-lg italic uppercase" style={{ color: t.color } as CSSProperties}>{t.name}</h3>
                        <p className="text-[9px] text-zinc-500 mt-1 uppercase tracking-tighter">Required: {t.cost.toFixed(2)} ⌬</p>
                      </div>
                      {unlockedThemes.includes(t.id) ? (
                        <button onClick={() => setActiveTheme(t.id)} className="mt-6 text-[10px] font-black py-2 border border-zinc-700 hover:bg-white hover:text-black transition-all uppercase">
                          {activeTheme === t.id ? "ACTIVE_MODULE" : "EQUIP_MODULE"}
                        </button>
                      ) : (
                        <button 
                          onClick={() => handlePurchase(t.id, t.cost)}
                          disabled={coins < t.cost}
                          className={`mt-6 text-[10px] font-black py-2 border transition-all uppercase ${coins >= t.cost ? "border-yellow-600 text-yellow-600 hover:bg-yellow-600 hover:text-black" : "border-zinc-900 text-zinc-800 cursor-not-allowed"}`}
                        >
                          {coins >= t.cost ? "PURCHASE" : "LOCKED"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* --- CHAT VIEW (SCROLL FIXED) --- */
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800">
                {chat.map((msg, index) => {
                  const isMe = msg.sender === username;
                  return (
                    <div key={msg._id || index} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div className="max-w-[85%] sm:max-w-[70%] group relative">
                        <span className={`text-[9px] text-zinc-600 uppercase mb-1.5 block font-bold tracking-tight ${isMe ? "text-right" : "text-left"}`}>
                          {msg.sender}
                        </span>
                        <div className={`p-4 rounded-sm transition-all relative bg-white/5 border-zinc-700 text-zinc-300`} 
                             style={{ borderRightWidth: isMe ? '2px' : '0px', borderLeftWidth: isMe ? '0px' : '2px', borderColor: isMe ? themeColor : '#3f3f46' } as CSSProperties}>
                          {msg.text && <p className="text-sm leading-relaxed font-medium antialiased">{msg.text}</p>}
                          {msg.gif && <img src={msg.gif} alt="gif" className="rounded-sm mt-3 w-full max-w-[280px] opacity-90 border border-white/10" />}
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

            {/* Input & GIF UI */}
            {!showShop && (
              <div className="p-4 bg-black/80 backdrop-blur-xl border-t border-zinc-900 mt-auto">
                {showGifs && (
                  <div className="mb-4 bg-[#0d0d0d] border border-zinc-800 p-4 rounded-sm shadow-2xl">
                    <input className="w-full bg-black border border-zinc-800 p-2.5 text-xs outline-none transition-all mb-4" 
                           style={{ color: themeColor, borderColor: themeColor } as CSSProperties} 
                           placeholder="Search Giphy..." value={gifSearch} onChange={(e) => setGifSearch(e.target.value)} 
                           onKeyDown={(e) => e.key === 'Enter' && searchGifs()} />
                    <div className="grid grid-cols-3 gap-2 h-40 overflow-y-auto">
                        {gifs.map((g) => (
                          <img key={g.id} src={g.images.fixed_height_small.url} className="w-full h-24 object-cover cursor-pointer hover:scale-95 transition-transform border border-transparent hover:border-white" onClick={() => sendGif(g.images.fixed_height.url)} />
                        ))}
                    </div>
                  </div>
                )}

                <form onSubmit={sendMessage} className="flex gap-3 items-center">
                  <button type="button" onClick={() => setShowGifs(!showGifs)} className={`px-4 py-3 text-[10px] font-black border transition-all ${showGifs ? "text-black" : "text-zinc-500"}`} style={{ backgroundColor: showGifs ? themeColor : 'transparent', borderColor: showGifs ? themeColor : '#27272a' } as CSSProperties}>
                    GIF
                  </button>
                  <input 
                    type="text" 
                    className="flex-1 bg-[#0f0f0f] border border-zinc-800 p-3 text-sm focus:outline-none transition-all text-white placeholder-zinc-800" 
                    onFocus={(e) => e.target.style.borderColor = themeColor}
                    onBlur={(e) => e.target.style.borderColor = '#27272a'}
                    placeholder="Awaiting input..." 
                    value={message} 
                    onChange={(e) => setMessage(e.target.value)} 
                  />
                  <button type="submit" className="px-8 py-3 font-black text-[10px] transition-all uppercase tracking-widest text-black" style={{ backgroundColor: themeColor } as CSSProperties}>
                    Execute
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}