"use client";

import { useState, useEffect, useRef, CSSProperties } from "react";
import { socket } from "@/lib/socket";

// --- ENCRYPTION HELPER ---
const crypt = (str: string) => {
  const key = "019_SECRET_PROTOCOL";
  return str.split('').map((char, i) => 
    String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
  ).join('');
};

// --- TYPESCRIPT INTERFACES ---
interface Message {
  sender: string;
  text?: string;
  gif?: string;
  room?: string;
  isEncrypted?: boolean;
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

const THEMES: Theme[] = [
  { id: 'default', name: 'MATRIX_GREEN', cost: 0, color: '#22c55e' },
  { id: 'blood', name: 'BLOOD_PROTOCOL', cost: 5.0, color: '#ef4444' },
  { id: 'cobalt', name: 'COBALT_STRIKE', cost: 10.0, color: '#3b82f6' },
  { id: 'gold', name: 'ELITE_GOLD', cost: 50.0, color: '#eab308' },
];

const CHANNELS = ["global", "dev-ops", "intel"];

export default function Home() {
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [coins, setCoins] = useState<number>(0);
  
  const [currentRoom, setCurrentRoom] = useState<string>("global");
  const [activeDMs, setActiveDMs] = useState<string[]>([]); 
  const [notifications, setNotifications] = useState<Record<string, number>>({}); 
  const [chat, setChat] = useState<Message[]>([]);
  const [message, setMessage] = useState<string>("");

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; from: string } | null>(null);
  const [encryptEnabled, setEncryptEnabled] = useState<boolean>(false);

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

  // --- SYSTEM BEEP GENERATOR ---
  const playSystemBeep = (freq = 880, duration = 0.1) => {
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(freq, context.currentTime);
      gain.gain.setValueAtTime(0.05, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch (e) { console.error("Audio block", e); }
  };

  useEffect(() => {
    setMounted(true);
    const savedUser = localStorage.getItem("019_operator_name");
    const token = localStorage.getItem("019_token");
    if (savedUser && token) {
      setUsername(savedUser);
      setIsLoggedIn(true);
      if (!socket.connected) socket.connect();
    }

    socket.on("load_messages", (messages: Message[]) => {
      const decrypted = messages.map(m => m.isEncrypted ? { ...m, text: crypt(m.text || "") } : m);
      setChat(decrypted);
    });

    socket.on("receive_message", (data: Message) => {
      const msg = data.isEncrypted ? { ...data, text: crypt(data.text || "") } : data;
      if (msg.room === currentRoom || (!msg.room && currentRoom === "global")) {
        setChat((prev) => [...prev, msg]);
      }
    });

    socket.on("incoming_dm_alert", (data: { from: string, room: string, text: string }) => {
      if (currentRoom !== data.room) {
        playSystemBeep(440, 0.2); 
        setActiveDMs(prev => prev.includes(data.from) ? prev : [...prev, data.from]);
        setNotifications(prev => ({ ...prev, [data.room]: (prev[data.room] || 0) + 1 }));
        setToast({ msg: data.text, from: data.from });
        setTimeout(() => setToast(null), 4000);
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

  useEffect(() => {
    if (isLoggedIn) {
      socket.emit("join_room", { room: currentRoom, username: username });
      if (notifications[currentRoom]) {
        setNotifications(prev => ({ ...prev, [currentRoom]: 0 }));
      }
    }
  }, [currentRoom, isLoggedIn, username]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, showShop]);

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
        if (isRegistering) setIsRegistering(false);
        else {
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
    setIsSidebarOpen(false);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      if (message.trim() === "/sys_grant_100" && (username === 'iloveshirin' || localStorage.getItem("019_role") === "admin")) {
        socket.emit("admin_grant_coins", { username });
        playSystemBeep(1200, 0.1);
        setMessage("");
        return;
      }

      const payload = { 
        user: username, 
        text: encryptEnabled ? crypt(message) : message, 
        gif: "", 
        room: currentRoom,
        isEncrypted: encryptEnabled
      };
      
      socket.emit("send_message", payload);
      playSystemBeep(800, 0.05);
      setMessage("");
    }
  };

  const searchGifs = async () => {
    if (!gifSearch.trim()) return;
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.NEXT_PUBLIC_GIPHY_KEY}&q=${gifSearch}&limit=12&rating=g`);
      const { data } = await res.json();
      setGifs(data);
    } catch (err) { console.error(err); }
  };

  const sendGif = (url: string) => {
    socket.emit("send_message", { user: username, text: "", gif: url, room: currentRoom });
    setShowGifs(false);
  };

  if (!mounted) return null;

  return (
    <main className="fixed inset-0 bg-[#050505] flex items-center justify-center overflow-hidden" style={{ color: themeColor } as CSSProperties}>
      
      {/* TOAST SYSTEM */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm bg-black border p-3 shadow-2xl animate-in slide-in-from-top-full duration-300" style={{ borderColor: themeColor }}>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Signal_Detected</p>
          <p className="text-xs font-bold text-white mt-1">@{toast.from}: <span className="font-normal opacity-70">Encypted_Msg...</span></p>
        </div>
      )}

      {!isLoggedIn ? (
        <div className="w-full max-w-sm border bg-black p-8 mx-4 rounded-sm shadow-2xl" style={{ borderColor: themeColor } as CSSProperties}>
          <div className="text-center mb-8 uppercase tracking-widest">
            <h1 className="text-3xl font-black italic tracking-tighter">Protocol_019</h1>
            <p className="text-[9px] opacity-50 mt-1">Encrypted_Access_Only</p>
          </div>
          <div className="space-y-4">
            <input className="w-full bg-transparent border-b p-3 outline-none text-base focus:brightness-150 transition-all" style={{ borderColor: themeColor } as CSSProperties} placeholder="OPERATOR_ID" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" className="w-full bg-transparent border-b p-3 outline-none text-base" style={{ borderColor: themeColor } as CSSProperties} placeholder="SECURITY_KEY" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={handleAuth} className="w-full text-black font-black py-4 uppercase text-sm mt-4 hover:brightness-110 active:scale-95 transition-all" style={{ backgroundColor: themeColor } as CSSProperties}>Establish_Link</button>
            <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-[10px] text-zinc-600 hover:text-white uppercase tracking-widest mt-4">{isRegistering ? "Back to Login" : "Request Entry"}</button>
          </div>
        </div>
      ) : (
        <div className="w-full h-full md:h-[92vh] md:max-w-6xl grid grid-cols-1 md:grid-cols-[260px_1fr] md:border border-zinc-900 bg-black md:rounded-sm overflow-hidden">
          
          {/* SIDEBAR DRAWER */}
          <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative z-50 w-[85%] md:w-full h-full border-r border-zinc-900 bg-[#080808] p-6 flex flex-col justify-between transition-transform duration-300`}>
            <div className="overflow-y-auto scrollbar-hide">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black tracking-tighter italic text-white uppercase">019_System</h2>
                <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-white text-xl p-2">✕</button>
              </div>
              <p className="text-2xl text-yellow-500 font-black tracking-tighter mb-6">{coins.toFixed(2)} ⌬</p>

              <div className="mb-8">
                <p className="text-[9px] text-zinc-600 mb-2 uppercase tracking-widest font-bold">Search_Operators</p>
                <input className="w-full bg-[#111] border border-zinc-800 p-3 text-sm outline-none text-white" placeholder="SEARCH_HANDLE..." value={userSearch} onChange={(e) => handleUserSearch(e.target.value)} />
                {searchResults.length > 0 && (
                  <div className="mt-1 border border-zinc-800 bg-black max-h-40 overflow-y-auto shadow-xl">
                    {searchResults.map(u => (
                      <button key={u.username} onClick={() => startPrivateChat(u.username)} className="w-full text-left p-3 text-[11px] hover:bg-zinc-900 border-b border-zinc-900 uppercase font-bold">{u.username}</button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 mb-6">
                <p className="text-[9px] text-zinc-600 mb-2 uppercase tracking-widest font-bold">Channels</p>
                {CHANNELS.map((ch) => (
                  <button key={ch} onClick={() => { setShowShop(false); setCurrentRoom(ch); setIsSidebarOpen(false); }} className={`w-full text-left text-[11px] p-3 transition-all uppercase font-bold flex justify-between items-center ${currentRoom === ch && !showShop ? 'bg-white/5 border-l-2' : 'opacity-40'}`} style={{ borderColor: currentRoom === ch && !showShop ? themeColor : 'transparent' }}>
                    <span># {ch}</span>
                    {notifications[ch] > 0 && <span className="bg-red-600 text-white text-[10px] px-2 rounded-full animate-pulse">{notifications[ch]}</span>}
                  </button>
                ))}
              </div>

              {activeDMs.length > 0 && (
                <div className="space-y-1 mb-6">
                  <p className="text-[9px] text-zinc-600 mb-2 uppercase tracking-widest font-bold">Direct_Comms</p>
                  {activeDMs.map((dmUser) => {
                    const dmRoomId = [username, dmUser].sort().join("_DM_");
                    return (
                      <button key={dmUser} onClick={() => { setShowShop(false); setCurrentRoom(dmRoomId); setIsSidebarOpen(false); }} className={`w-full text-left text-[11px] p-3 transition-all uppercase font-bold flex justify-between items-center ${currentRoom === dmRoomId && !showShop ? 'bg-white/5 border-l-2' : 'opacity-40'}`} style={{ borderColor: currentRoom === dmRoomId && !showShop ? themeColor : 'transparent' }}>
                        <span>@ {dmUser}</span>
                        {notifications[dmRoomId] > 0 && <span className="bg-red-600 text-white text-[10px] px-2 rounded-full animate-pulse">{notifications[dmRoomId]}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <button onClick={() => {setShowShop(!showShop); setIsSidebarOpen(false);}} className="mt-4 w-full text-left text-[10px] font-black tracking-widest uppercase hover:text-white transition-all" style={{ color: showShop ? '#fff' : themeColor } as CSSProperties}>
                {showShop ? '[ CLOSE_TERMINAL ]' : '[ ACCESS_STORE ]'}
              </button>
            </div>
            <button onClick={handleLogout} className="text-left text-[10px] text-red-900 transition-all uppercase font-black tracking-widest">[ Terminate ]</button>
          </div>

          {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/80 z-40 md:hidden" />}

          {/* CHAT AREA */}
          <div className="flex flex-col h-full bg-[#0a0a0a] relative overflow-hidden">
            <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-black/50 h-16">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-white text-2xl mr-1">☰</button>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold opacity-30 tracking-[0.2em]">{currentRoom.includes("_DM_") ? `SECURE_DM` : `ROOM // ${currentRoom.toUpperCase()}`}</span>
                  <span className="text-[10px] text-white font-black md:hidden uppercase">{username}</span>
                </div>
              </div>
              {(username === 'iloveshirin' || localStorage.getItem("019_role") === 'admin') && (
                <button onClick={() => { if(confirm("PURGE?")) socket.emit("clear_all_messages", username) }} className="text-[9px] text-yellow-600 border border-yellow-900 px-2 py-1 rounded font-bold uppercase">Purge</button>
              )}
            </div>

            {showShop ? (
              <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {THEMES.map((t) => (
                    <div key={t.id} className="border border-zinc-800 p-6 bg-black flex flex-col justify-between">
                      <div><h3 className="font-black text-lg italic uppercase" style={{ color: t.color } as CSSProperties}>{t.name}</h3><p className="text-[10px] text-zinc-500 mt-1">Cost: {t.cost.toFixed(2)} ⌬</p></div>
                      {unlockedThemes.includes(t.id) ? (
                        <button onClick={() => setActiveTheme(t.id)} className="mt-6 text-[10px] font-black py-3 border border-zinc-700 uppercase">Equip</button>
                      ) : (
                        <button onClick={() => handlePurchase(t.id, t.cost)} disabled={coins < t.cost} className={`mt-6 text-[10px] font-black py-3 border uppercase ${coins >= t.cost ? "border-yellow-600 text-yellow-600" : "border-zinc-900 text-zinc-800"}`}>Buy</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide">
                {chat.map((msg, index) => {
                  const isMe = msg.sender === username;
                  return (
                    <div key={msg._id || index} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div className="max-w-[92%] md:max-w-[75%] group relative">
                        <span className={`text-[9px] text-zinc-600 uppercase mb-1 block font-bold ${isMe ? "text-right" : "text-left"}`}>{msg.sender} {msg.isEncrypted && "[ENCRYPTED]"}</span>
                        <div className={`p-3 md:p-4 rounded-sm relative bg-white/5 border-zinc-700 text-zinc-300`} 
                             style={{ borderRightWidth: isMe ? '2px' : '0px', borderLeftWidth: isMe ? '0px' : '2px', borderColor: isMe ? themeColor : '#3f3f46' } as CSSProperties}>
                          {msg.text && <p className="text-sm md:text-base leading-relaxed">{msg.text}</p>}
                          {msg.gif && <img src={msg.gif} alt="gif" className="rounded-sm mt-3 w-full max-w-[280px]" />}
                          {(isMe || username === 'iloveshirin' || localStorage.getItem("019_role") === "admin") && (
                              <button onClick={() => socket.emit("delete_message", { messageId: msg._id, username: username })} className="absolute -top-2 -right-2 bg-red-600 text-white text-[8px] px-1.5 py-0.5 rounded-sm font-bold">DEL</button>
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
              <div className="p-3 md:p-4 bg-black border-t border-zinc-900 pb-safe">
                <div className="flex gap-2 mb-2">
                  <button onClick={() => { setEncryptEnabled(!encryptEnabled); playSystemBeep(encryptEnabled ? 440 : 880, 0.05); }}
                          className={`text-[8px] font-black px-2 py-1 border transition-all ${encryptEnabled ? "bg-white text-black border-white" : "border-zinc-800 opacity-40"}`}>
                    {encryptEnabled ? "ENCRYPTION_LINK_ACTIVE" : "PLAINTEXT_MODE"}
                  </button>
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 items-center">
                  <button type="button" onClick={() => setShowGifs(!showGifs)} className="px-3 md:px-4 py-3 text-[10px] font-black border uppercase" style={{ backgroundColor: showGifs ? themeColor : 'transparent', borderColor: showGifs ? themeColor : '#27272a', color: showGifs ? 'black' : 'inherit' } as CSSProperties}>GIF</button>
                  <input type="text" className="flex-1 bg-[#0f0f0f] border border-zinc-800 p-3 text-base focus:outline-none text-white" onFocus={(e) => e.target.style.borderColor = themeColor} onBlur={(e) => e.target.style.borderColor = '#27272a'} placeholder={encryptEnabled ? "Secure data..." : "Type..." } value={message} onChange={(e) => setMessage(e.target.value)} />
                  <button type="submit" className="px-4 md:px-8 py-3 font-black text-[10px] uppercase text-black" style={{ backgroundColor: themeColor } as CSSProperties}>SEND</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}