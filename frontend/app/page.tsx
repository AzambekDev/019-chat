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
  isVanishing?: boolean;
  seenBy?: string[];
  _id?: string;
  id?: string;
}

interface Theme { id: string; name: string; cost: number; color: string; }
interface UserProfile { username: string; bio: string; avatar: string; status: string; }
interface UserResult { username: string; role: string; status?: string; }

const THEMES: Theme[] = [
  { id: 'default', name: 'MATRIX_GREEN', cost: 0, color: '#22c55e' },
  { id: 'blood', name: 'BLOOD_PROTOCOL', cost: 5.0, color: '#ef4444' },
  { id: 'cobalt', name: 'COBALT_STRIKE', cost: 10.0, color: '#3b82f6' },
  { id: 'gold', name: 'ELITE_GOLD', cost: 50.0, color: '#eab308' },
];

const CHANNELS = ["global", "dev-ops", "intel"];

export default function Home() {
  // --- CORE STATES ---
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(""); 
  const [avatar, setAvatar] = useState(""); 
  const [bio, setBio] = useState(""); 
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coins, setCoins] = useState(0);

  // --- NEW FEATURE STATES ---
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isVanishing, setIsVanishing] = useState(false);
  
  // --- CHAT STATES ---
  const [currentRoom, setCurrentRoom] = useState("global");
  const [activeDMs, setActiveDMs] = useState<string[]>([]); 
  const [notifications, setNotifications] = useState<Record<string, number>>({}); 
  const [chat, setChat] = useState<Message[]>([]);
  const [message, setMessage] = useState("");

  // --- UI STATES ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; from: string } | null>(null);
  const [encryptEnabled, setEncryptEnabled] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [activeTheme, setActiveTheme] = useState('default');
  const [unlockedThemes, setUnlockedThemes] = useState(['default']);
  
  // --- GIF STATES ---
  const [showGifs, setShowGifs] = useState(false);
  const [gifSearch, setGifSearch] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);

  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const themeColor = THEMES.find(t => t.id === activeTheme)?.color || '#22c55e';

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
    } catch (e) {}
  };

  useEffect(() => {
    setMounted(true);
    const savedUser = localStorage.getItem("019_operator_name");
    const token = localStorage.getItem("019_token");
    const savedDMs = localStorage.getItem("019_active_dms");

    if (savedUser && token) {
      setUsername(savedUser);
      setIsLoggedIn(true);
      if (savedDMs) setActiveDMs(JSON.parse(savedDMs));
      if (!socket.connected) socket.connect();
    }
  }, []);

  // --- READ RECEIPTS TRIGGER ---
  useEffect(() => {
    if (isLoggedIn && chat.length > 0) {
      socket.emit("mark_as_read", { room: currentRoom, username });
    }
  }, [currentRoom, chat.length, isLoggedIn, username]);

  useEffect(() => {
    if (activeDMs.length > 0) localStorage.setItem("019_active_dms", JSON.stringify(activeDMs));
  }, [activeDMs]);

  useEffect(() => {
    socket.on("load_messages", (messages: Message[]) => {
      setChat(messages.map(m => m.isEncrypted ? { ...m, text: crypt(m.text || "") } : m));
    });

    socket.on("receive_message", (data: Message) => {
      const msg = data.isEncrypted ? { ...data, text: crypt(data.text || "") } : data;
      if (msg.room === currentRoom || (!msg.room && currentRoom === "global")) {
        setChat((prev) => [...prev, msg]);
      }
    });

    socket.on("messages_read_update", ({ room, seenBy }) => {
      if (room === currentRoom) {
        setChat(prev => prev.map(m => ({
          ...m,
          seenBy: Array.from(new Set([...(m.seenBy || []), ...seenBy]))
        })));
      }
    });

    socket.on("vanishing_pulse", (id: string) => {
      setChat(prev => prev.filter(m => (m._id || m.id) !== id));
    });

    socket.on("incoming_dm_alert", (data: any) => {
      setActiveDMs((prev) => prev.includes(data.from) ? prev : [...prev, data.from]);
      if (currentRoom !== data.room) {
        playSystemBeep(440, 0.2); 
        setNotifications(prev => ({ ...prev, [data.room]: (prev[data.room] || 0) + 1 }));
        setToast({ msg: data.text, from: data.from });
        setTimeout(() => setToast(null), 4000);
      }
    });

    socket.on("user_status_change", (data: any) => {
      if (viewingProfile?.username === data.username) {
        setViewingProfile(prev => prev ? { ...prev, status: data.status } : null);
      }
    });

    socket.on("coin_update", (val: number) => setCoins(val));
    socket.on("theme_unlocked", (data: any) => {
      setUnlockedThemes(data.unlocked);
      setActiveTheme(data.active);
    });
    socket.on("message_deleted", (id: string) => setChat(prev => prev.filter(m => (m._id || m.id) !== id)));
    socket.on("chat_cleared", () => setChat([]));

    return () => { socket.off(); };
  }, [currentRoom, viewingProfile]);

  useEffect(() => {
    if (isLoggedIn && username) {
      socket.emit("join_room", { room: username, username: username });
      socket.emit("join_room", { room: currentRoom, username: username });
      if (notifications[currentRoom]) setNotifications(prev => ({ ...prev, [currentRoom]: 0 }));
    }
  }, [currentRoom, isLoggedIn, username]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, showShop]);

  const openProfile = async (target: string) => {
    try {
      const res = await fetch(`https://zero19-chat.onrender.com/api/users/profile/${target}`);
      const data = await res.json();
      setViewingProfile(data);
      setBioInput(data.bio || "SYSTEM_OPERATOR");
    } catch (e) {}
  };

  const saveBio = async () => {
    await fetch(`https://zero19-chat.onrender.com/api/users/update-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, bio: bioInput })
    });
    setIsEditingBio(false);
    setViewingProfile(prev => prev ? { ...prev, bio: bioInput } : null);
  };

  const handleAuth = async () => {
    const endpoint = isRegistering ? "register" : "login";
    const payload = isRegistering ? { username, password, email, avatar, bio } : { username, password };
    
    try {
      const res = await fetch(`https://zero19-chat.onrender.com/api/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("019_token", data.token);
        localStorage.setItem("019_operator_name", data.username);
        localStorage.setItem("019_role", data.role);
        setCoins(data.coins || 0);
        setUnlockedThemes(data.unlockedThemes || ['default']);
        setActiveTheme(data.activeTheme || 'default');
        setIsLoggedIn(true);
        if (isRegistering) setShowOnboarding(true);
        socket.connect();
        playSystemBeep(1200, 0.2);
      } else { alert(data.error); }
    } catch (e) { console.error("Auth Fail"); }
  };

  const handleUserSearch = async (val: string) => {
    setUserSearch(val);
    if (val.length < 2) return setSearchResults([]);
    const res = await fetch(`https://zero19-chat.onrender.com/api/users/search?query=${val}`);
    const data = await res.json();
    setSearchResults(data);
  };

  const startPrivateChat = (targetUser: string) => {
    const roomId = [username, targetUser].sort().join("_DM_");
    setActiveDMs(prev => prev.includes(targetUser) ? prev : [...prev, targetUser]);
    setCurrentRoom(roomId);
    setUserSearch("");
    setSearchResults([]);
    setShowShop(false);
    setIsSidebarOpen(false);
    setViewingProfile(null);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      socket.emit("send_message", { 
        user: username, 
        text: encryptEnabled ? crypt(message) : message, 
        room: currentRoom, 
        isEncrypted: encryptEnabled,
        isVanishing: isVanishing 
      });
      setMessage("");
      playSystemBeep(800, 0.05);
    }
  };

  const searchGifs = async () => {
    if (!gifSearch.trim()) return;
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.NEXT_PUBLIC_GIPHY_KEY}&q=${gifSearch}&limit=12&rating=g`);
    const { data } = await res.json();
    setGifs(data);
  };

  const sendGif = (url: string) => {
    socket.emit("send_message", { user: username, text: "", gif: url, room: currentRoom, isVanishing });
    setShowGifs(false);
  };

  const handlePurchase = (themeId: string, cost: number) => socket.emit('purchase_theme', { username, themeId, cost });

  // --- MISSING FUNCTION RESTORED ---
  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  if (!mounted) return null;

  return (
    <main className="fixed inset-0 bg-[#050505] flex items-center justify-center overflow-hidden font-mono" style={{ color: themeColor } as CSSProperties}>
      
      {/* FEATURE 1: ONBOARDING SCREEN */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="max-w-md w-full space-y-6 border border-zinc-800 p-8 bg-[#050505] shadow-[0_0_50px_rgba(0,0,0,1)]">
            <h2 className="text-2xl font-black italic tracking-tighter border-b pb-4 animate-pulse" style={{ borderColor: themeColor, color: themeColor }}>INITIALIZING_PROTOCOL_019</h2>
            <div className="space-y-4 text-[10px] uppercase tracking-widest leading-relaxed text-zinc-400">
              <p>&gt; <span className="text-white font-bold">Encrypted Comms:</span> Toggle Secure Link for XOR-ciphered transmissions.</p>
              <p>&gt; <span className="text-orange-500 font-bold">Vanishing Mode:</span> Enable data self-destruct for high-risk intel.</p>
              <p>&gt; <span className="text-yellow-500 font-bold">Currency:</span> Earn ⌬ 0.01 per transmission to unlock terminal themes.</p>
              <p>&gt; <span className="text-white font-bold">Dossier:</span> Click any handle to view operator profiles.</p>
            </div>
            <button onClick={() => setShowOnboarding(false)} className="w-full py-4 font-black uppercase text-xs tracking-[0.3em] hover:brightness-125 transition-all text-black" style={{ backgroundColor: themeColor }}>Accept_Terms</button>
          </div>
        </div>
      )}

      {/* DOSSIER MODAL */}
      {viewingProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm border bg-[#080808] p-6 shadow-2xl" style={{ borderColor: themeColor }}>
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                  {viewingProfile.avatar ? <img src={viewingProfile.avatar} className="w-full h-full object-cover" /> : <span className="text-2xl font-black opacity-20">{viewingProfile.username[0].toUpperCase()}</span>}
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white">{viewingProfile.username}</h3>
                  <span className={`text-[10px] flex items-center gap-1 font-bold ${viewingProfile.status === 'ONLINE' ? 'text-green-500' : 'text-zinc-600'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span> {viewingProfile.status}
                  </span>
                </div>
              </div>
              <button onClick={() => {setViewingProfile(null); setIsEditingBio(false);}} className="text-white hover:opacity-50">✕</button>
            </div>
            <div className="space-y-6">
              <div>
                <p className="text-[9px] uppercase font-bold text-zinc-500 mb-2 tracking-[0.2em]">Operator_Bio</p>
                {isEditingBio ? (
                  <textarea className="w-full bg-black border border-zinc-800 p-3 text-sm outline-none text-white focus:border-white transition-all font-mono" value={bioInput} onChange={(e) => setBioInput(e.target.value)} rows={3} />
                ) : (
                  <p className="text-sm bg-black/40 p-4 border border-zinc-900 italic text-zinc-300">"{viewingProfile.bio}"</p>
                )}
              </div>
              {viewingProfile.username === username ? (
                <button onClick={() => isEditingBio ? saveBio() : setIsEditingBio(true)} className="w-full py-3 bg-white text-black text-[10px] font-black uppercase hover:brightness-75 transition-all">
                  {isEditingBio ? "COMMIT_CHANGES" : "MODIFY_DOSSIER"}
                </button>
              ) : (
                <button onClick={() => startPrivateChat(viewingProfile.username)} className="w-full py-3 border border-zinc-700 text-[10px] font-black uppercase hover:bg-white hover:text-black transition-all">ESTABLISH_PRIVATE_LINK</button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm bg-black border p-3 shadow-2xl animate-in slide-in-from-top-full duration-300" style={{ borderColor: themeColor }}>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Signal_Intercepted</p>
          <p className="text-xs font-bold text-white mt-1">@{toast.from}: <span className="font-normal opacity-70">Deciphering...</span></p>
        </div>
      )}

      {!isLoggedIn ? (
        <div className="w-full max-w-sm border bg-black p-8 mx-4 rounded-sm shadow-2xl style={{ borderColor: themeColor } as CSSProperties}">
          <div className="text-center mb-8 uppercase tracking-widest">
            <h1 className="text-3xl font-black italic tracking-tighter">Protocol_019</h1>
            <p className="text-[9px] opacity-50 mt-1">Encrypted_Access_Only</p>
          </div>
          <div className="space-y-4">
            {/* AVATAR PREVIEW */}
            {isRegistering && avatar && (
              <div className="flex flex-col items-center mb-6 animate-in zoom-in-95 duration-300">
                <div className="w-24 h-24 rounded-full border-2 overflow-hidden bg-zinc-900 shadow-[0_0_15px_rgba(0,0,0,0.5)]" style={{ borderColor: themeColor }}>
                  <img src={avatar} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} />
                </div>
                <p className="text-[8px] uppercase font-black tracking-[0.2em] mt-2 opacity-50">Identity_Preview</p>
              </div>
            )}
            <input className="w-full bg-transparent border-b p-3 outline-none text-base focus:brightness-150 transition-all placeholder-zinc-800" style={{ borderColor: themeColor } as CSSProperties} placeholder="OPERATOR_ID" value={username} onChange={(e) => setUsername(e.target.value)} />
            
            {isRegistering && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <input className="w-full bg-transparent border-b p-3 outline-none text-base focus:brightness-150 transition-all placeholder-zinc-800" style={{ borderColor: themeColor } as CSSProperties} placeholder="SECURE_EMAIL" value={email} onChange={(e) => setEmail(e.target.value)} />
                <div className="relative group">
                  <input className="w-full bg-transparent border-b p-3 outline-none text-base focus:brightness-150 transition-all placeholder-zinc-800 pr-10" style={{ borderColor: themeColor } as CSSProperties} placeholder="AVATAR_URL" value={avatar} onChange={(e) => setAvatar(e.target.value)} />
                  <div className="absolute right-2 top-3 cursor-help opacity-40 hover:opacity-100 transition-opacity">
                    <span className="text-[10px] border rounded-full w-4 h-4 flex items-center justify-center font-bold" style={{ borderColor: themeColor }}>i</span>
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-[#111] border border-zinc-800 text-[10px] leading-tight text-zinc-400 hidden group-hover:block z-50 shadow-2xl pointer-events-none font-mono"><p className="font-black text-white mb-1 uppercase tracking-tighter">[GUIDE]</p>Right-click any web image &gt; "Copy Image Address". Paste here.</div>
                  </div>
                </div>
                <input className="w-full bg-transparent border-b p-3 outline-none text-base focus:brightness-150 transition-all placeholder-zinc-800" style={{ borderColor: themeColor } as CSSProperties} placeholder="INITIAL_BIO" value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
            )}

            <input type="password" className="w-full bg-transparent border-b p-3 outline-none text-base focus:brightness-150 transition-all placeholder-zinc-800" style={{ borderColor: themeColor } as CSSProperties} placeholder="SECURITY_KEY" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={handleAuth} className="w-full text-black font-black py-4 uppercase text-sm mt-4 hover:brightness-110 active:scale-95 transition-all shadow-lg" style={{ backgroundColor: themeColor } as CSSProperties}>{isRegistering ? "Register_Identity" : "Establish_Link"}</button>
            <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-[10px] text-zinc-600 hover:text-white uppercase tracking-widest mt-4">{isRegistering ? "Return to Login" : "Request Entry"}</button>
          </div>
        </div>
      ) : (
        <div className="w-full h-full md:h-[92vh] md:max-w-6xl grid grid-cols-1 md:grid-cols-[260px_1fr] md:border border-zinc-900 bg-black md:rounded-sm overflow-hidden">
          {/* SIDEBAR */}
          <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative z-50 w-[85%] md:w-full h-full border-r border-zinc-900 bg-[#080808] p-6 flex flex-col justify-between transition-transform duration-300 ease-in-out`}>
            <div className="overflow-y-auto scrollbar-hide">
              <div className="flex justify-between items-center mb-6">
                <button onClick={() => openProfile(username)} className="text-xl font-black tracking-tighter italic text-white uppercase hover:opacity-50 transition-all">019_System</button>
                <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-white text-xl p-2">✕</button>
              </div>
              <p className="text-2xl text-yellow-500 font-black tracking-tighter mb-6">{coins.toFixed(2)} ⌬</p>

              <div className="mb-8">
                <p className="text-[9px] text-zinc-600 mb-2 uppercase tracking-widest font-bold">Search_Operators</p>
                <input className="w-full bg-[#111] border border-zinc-800 p-3 text-sm outline-none text-white focus:border-zinc-500" placeholder="SEARCH_HANDLE..." value={userSearch} onChange={(e) => handleUserSearch(e.target.value)} />
                {searchResults.length > 0 && (
                  <div className="mt-1 border border-zinc-800 bg-black max-h-40 overflow-y-auto shadow-xl">
                    {searchResults.map(u => (
                      <button key={u.username} onClick={() => openProfile(u.username)} className="w-full text-left p-3 text-[11px] hover:bg-zinc-900 border-b border-zinc-900 uppercase font-bold text-white flex justify-between items-center">
                        {u.username}
                        <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'ONLINE' ? 'bg-green-500' : 'bg-zinc-800'}`}></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 mb-6">
                <p className="text-[9px] text-zinc-600 mb-2 uppercase tracking-widest font-bold">Channels</p>
                {CHANNELS.map((ch) => (
                  <button key={ch} onClick={() => { setShowShop(false); setCurrentRoom(ch); setIsSidebarOpen(false); }} className={`w-full text-left text-[11px] p-3 transition-all uppercase font-bold flex justify-between items-center ${currentRoom === ch && !showShop ? 'bg-white/5 border-l-2' : 'opacity-40 hover:opacity-100'}`} style={{ borderColor: currentRoom === ch && !showShop ? themeColor : 'transparent' }}>
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
                        <span className="truncate pr-2">@ {dmUser}</span>
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
            <button onClick={handleLogout} className="text-left text-[10px] text-red-900 transition-all uppercase font-black hover:text-red-500">[ Terminate ]</button>
          </div>

          {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/80 z-40 md:hidden" />}

          {/* CHAT AREA */}
          <div className="flex flex-col h-full bg-[#0a0a0a] relative overflow-hidden">
            <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-black/50 h-16 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-white text-2xl mr-1">☰</button>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold opacity-30 tracking-[0.2em]">{currentRoom.includes("_DM_") ? `SECURE_DM` : `ROOM // ${currentRoom.toUpperCase()}`}</span>
                  <span className="text-[10px] text-white font-black md:hidden uppercase">{username}</span>
                  {isVanishing && <span className="text-[7px] text-orange-500 font-black animate-pulse tracking-[0.3em]">AUTO_PURGE_ACTIVE</span>}
                </div>
              </div>
              {(username === 'iloveshirin' || localStorage.getItem("019_role") === 'admin') && (
                <button onClick={() => { if(confirm("PURGE_ALL_RECORDS?")) socket.emit("clear_all_messages", username) }} className="text-[9px] text-yellow-600 border border-yellow-900 px-2 py-1 rounded font-bold uppercase hover:bg-yellow-900 hover:text-black transition-all">Purge</button>
              )}
            </div>

            {showShop ? (
              <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {THEMES.map((t) => (
                    <div key={t.id} className="border border-zinc-800 p-6 bg-black flex flex-col justify-between hover:border-zinc-500 transition-all">
                      <div><h3 className="font-black text-lg italic uppercase" style={{ color: t.color } as CSSProperties}>{t.name}</h3><p className="text-[10px] text-zinc-500 mt-1">Cost: {t.cost.toFixed(2)} ⌬</p></div>
                      {unlockedThemes.includes(t.id) ? (
                        <button onClick={() => setActiveTheme(t.id)} className="mt-6 text-[10px] font-black py-3 border border-zinc-700 uppercase hover:bg-white hover:text-black transition-all">Equip</button>
                      ) : (
                        <button onClick={() => handlePurchase(t.id, t.cost)} disabled={coins < t.cost} className={`mt-6 text-[10px] font-black py-3 border uppercase transition-all ${coins >= t.cost ? "border-yellow-600 text-yellow-600 hover:bg-yellow-600 hover:text-black" : "border-zinc-900 text-zinc-800 cursor-not-allowed"}`}>Buy</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide font-mono">
                {chat.map((msg, index) => {
                  const isMe = msg.sender === username;
                  const isRead = msg.seenBy && msg.seenBy.length > 1; // Feature 2: Read Receipt Logic
                  return (
                    <div key={msg._id || index} className={`flex flex-col ${isMe ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-1 duration-300`}>
                      <div className="max-w-[92%] md:max-w-[75%] group relative">
                        <button onClick={() => openProfile(msg.sender)} className={`text-[9px] text-zinc-600 uppercase mb-1 block font-bold hover:text-white transition-colors ${isMe ? "text-right w-full" : "text-left"}`}>
                          {msg.sender} {msg.isEncrypted && "[ENCRYPTED]"} {msg.isVanishing && "[VANISHING]"}
                        </button>
                        <div className={`p-3 md:p-4 rounded-sm relative bg-white/5 border-zinc-700 text-zinc-300 shadow-sm ${msg.isVanishing ? 'border-orange-900 italic' : ''}`} 
                             style={{ borderRightWidth: isMe ? '2px' : '0px', borderLeftWidth: isMe ? '0px' : '2px', borderColor: isMe ? (msg.isVanishing ? '#7c2d12' : themeColor) : '#3f3f46' } as CSSProperties}>
                          {msg.text && <p className="text-sm md:text-base leading-relaxed break-words">{msg.text}</p>}
                          {msg.gif && <img src={msg.gif} alt="gif" className="rounded-sm mt-3 w-full max-w-[280px] border border-white/5" />}
                          {(isMe || username === 'iloveshirin' || localStorage.getItem("019_role") === "admin") && (
                              <button onClick={() => socket.emit("delete_message", { messageId: msg._id, username: username })} className="absolute -top-2 -right-2 bg-red-600 text-white text-[8px] px-1.5 py-0.5 rounded-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">DEL</button>
                          )}
                        </div>
                        {isMe && (
                          <div className={`text-[8px] mt-1 font-black italic tracking-tighter ${isRead ? 'text-blue-500' : 'opacity-20'}`}>
                            {isRead ? ">> TRANSMISSION_RECEIVED" : "> SIGNAL_SENT"}
                          </div>
                        )}
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
                          className={`text-[8px] font-black px-2 py-1 border transition-all ${encryptEnabled ? "bg-white text-black border-white shadow-[0_0_10px_rgba(255,255,255,0.3)]" : "border-zinc-800 opacity-40 hover:opacity-100"}`}>
                    {encryptEnabled ? "ENCRYPTION_LINK_ACTIVE" : "PLAINTEXT_MODE"}
                  </button>
                  {/* FEATURE 5: VANISHING TOGGLE */}
                  <button onClick={() => { setIsVanishing(!isVanishing); playSystemBeep(isVanishing ? 300 : 1200, 0.05); }}
                          className={`text-[8px] font-black px-2 py-1 border transition-all ${isVanishing ? "bg-orange-600 text-white border-orange-600 shadow-[0_0_10px_rgba(234,88,12,0.5)]" : "border-zinc-800 opacity-40 hover:opacity-100"}`}>
                    {isVanishing ? "VANISHING_ENABLED" : "STATIC_STORAGE"}
                  </button>
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 items-center">
                  <button type="button" onClick={() => {setShowGifs(!showGifs); playSystemBeep(1000, 0.03);}} className={`px-3 md:px-4 py-3 text-[10px] font-black border uppercase transition-all ${showGifs ? "text-black" : "text-zinc-500"}`} style={{ backgroundColor: showGifs ? themeColor : 'transparent', borderColor: showGifs ? themeColor : '#27272a', color: showGifs ? 'black' : 'inherit' } as CSSProperties}>GIF</button>
                  <input type="text" className="flex-1 bg-[#0f0f0f] border border-zinc-800 p-3 text-base focus:outline-none text-white transition-all" onFocus={(e) => e.currentTarget.style.borderColor = themeColor} onBlur={(e) => e.currentTarget.style.borderColor = '#27272a'} placeholder={isVanishing ? "Destructible transmission..." : "Awaiting input..." } value={message} onChange={(e) => setMessage(e.target.value)} />
                  <button type="submit" className="px-4 md:px-8 py-3 font-black text-[10px] uppercase text-black hover:brightness-110 active:scale-95 transition-all shadow-md" style={{ backgroundColor: themeColor } as CSSProperties}>SEND</button>
                </form>
                
                {/* RESTORED GIF MENU */}
                {showGifs && (
                  <div className="mt-4 bg-[#0d0d0d] border border-zinc-800 p-4 rounded-sm shadow-2xl animate-in zoom-in-95 duration-200">
                    <input className="w-full bg-black border border-zinc-800 p-3 text-sm outline-none text-white mb-4" style={{ borderColor: themeColor }} placeholder="Search Giphy..." value={gifSearch} onChange={(e) => setGifSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchGifs()} />
                    <div className="grid grid-cols-3 gap-2 h-40 overflow-y-auto pr-2">
                        {gifs.map((g) => ( <img key={g.id} src={g.images.fixed_height_small.url} className="w-full h-24 object-cover cursor-pointer hover:scale-105 transition-transform rounded-sm" onClick={() => sendGif(g.images.fixed_height.url)} /> ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}