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

interface UserProfile {
  username: string;
  bio: string;
  avatar: string;
  status: string;
  lastSeen?: string;
}

interface Theme {
  id: string;
  name: string;
  cost: number;
  color: string;
}

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
  
  const [currentRoom, setCurrentRoom] = useState<string>("global");
  const [activeDMs, setActiveDMs] = useState<string[]>([]); 
  const [notifications, setNotifications] = useState<Record<string, number>>({}); 
  const [chat, setChat] = useState<Message[]>([]);
  const [message, setMessage] = useState<string>("");

  // --- UI STATES ---
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [bioInput, setBioInput] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; from: string } | null>(null);
  const [encryptEnabled, setEncryptEnabled] = useState<boolean>(false);
  const [showShop, setShowShop] = useState<boolean>(false);
  const [activeTheme, setActiveTheme] = useState<string>('default');
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>(['default']);
  
  // --- GIF STATES ---
  const [showGifs, setShowGifs] = useState<boolean>(false);
  const [gifSearch, setGifSearch] = useState<string>("");
  const [gifs, setGifs] = useState<any[]>([]);
  
  const [userSearch, setUserSearch] = useState<string>("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const themeColor = THEMES.find(t => t.id === activeTheme)?.color || '#22c55e';

  // --- SYSTEM BEEP ---
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
    const savedDMs = localStorage.getItem("019_active_dms");
    if (savedUser) {
      setUsername(savedUser);
      setIsLoggedIn(true);
      if (savedDMs) setActiveDMs(JSON.parse(savedDMs));
      if (!socket.connected) socket.connect();
    }
  }, []);

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

    socket.on("incoming_dm_alert", (data: { from: string, room: string, text: string }) => {
      setActiveDMs((prev) => prev.includes(data.from) ? prev : [...prev, data.from]);
      if (currentRoom !== data.room) {
        playSystemBeep(440, 0.2); 
        setNotifications(prev => ({ ...prev, [data.room]: (prev[data.room] || 0) + 1 }));
        setToast({ msg: data.text, from: data.from });
        setTimeout(() => setToast(null), 4000);
      }
    });

    socket.on("user_status_change", (data: { username: string, status: string }) => {
      if (viewingProfile?.username === data.username) {
        setViewingProfile(prev => prev ? { ...prev, status: data.status } : null);
      }
    });

    socket.on("coin_update", (newBalance: number) => setCoins(newBalance));
    socket.on("theme_unlocked", (data: any) => { setUnlockedThemes(data.unlocked); setActiveTheme(data.active); });
    socket.on("message_deleted", (id: string) => setChat((prev) => prev.filter((msg) => (msg._id || msg.id) !== id)));

    return () => {
      socket.off("receive_message");
      socket.off("incoming_dm_alert");
      socket.off("user_status_change");
    };
  }, [currentRoom, viewingProfile]);

  useEffect(() => {
    if (isLoggedIn && username) {
      socket.emit("join_room", { room: username, username: username });
      socket.emit("join_room", { room: currentRoom, username: username });
      if (notifications[currentRoom]) setNotifications(prev => ({ ...prev, [currentRoom]: 0 }));
    }
    if (activeDMs.length > 0) localStorage.setItem("019_active_dms", JSON.stringify(activeDMs));
  }, [currentRoom, isLoggedIn, username]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  // --- ACTIONS ---
  const openProfile = async (target: string) => {
    try {
      const res = await fetch(`https://zero19-chat.onrender.com/api/users/profile/${target}`);
      const data = await res.json();
      setViewingProfile(data);
      setBioInput(data.bio);
      playSystemBeep(900, 0.05);
    } catch (err) {}
  };

  const saveProfile = async () => {
    await fetch(`https://zero19-chat.onrender.com/api/users/update-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, bio: bioInput })
    });
    setIsEditingProfile(false);
    setViewingProfile(prev => prev ? { ...prev, bio: bioInput } : null);
  };

  const handleAuth = async () => {
    const endpoint = isRegistering ? "register" : "login";
    const res = await fetch(`https://zero19-chat.onrender.com/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && !isRegistering) {
      localStorage.setItem("019_token", data.token);
      localStorage.setItem("019_operator_name", data.username);
      setCoins(data.coins || 0);
      setIsLoggedIn(true);
      socket.connect();
    } else if (res.ok) setIsRegistering(false);
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
    setIsSidebarOpen(false);
    setViewingProfile(null);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    socket.emit("send_message", { 
      user: username, 
      text: encryptEnabled ? crypt(message) : message, 
      room: currentRoom, 
      isEncrypted: encryptEnabled 
    });
    playSystemBeep(800, 0.05);
    setMessage("");
  };

  // --- GIF LOGIC ---
  const searchGifs = async () => {
    if (!gifSearch.trim()) return;
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.NEXT_PUBLIC_GIPHY_KEY}&q=${gifSearch}&limit=12&rating=g`);
      const { data } = await res.json();
      setGifs(data);
    } catch (err) {}
  };

  const sendGif = (url: string) => {
    socket.emit("send_message", { user: username, text: "", gif: url, room: currentRoom });
    setShowGifs(false);
    playSystemBeep(1000, 0.05);
  };

  const handleLogout = () => { localStorage.clear(); window.location.reload(); };
  const handlePurchase = (themeId: string, cost: number) => socket.emit('purchase_theme', { username, themeId, cost });

  if (!mounted) return null;

  return (
    <main className="fixed inset-0 bg-[#050505] flex items-center justify-center overflow-hidden font-mono" style={{ color: themeColor } as CSSProperties}>
      
      {/* DOSSIER MODAL */}
      {viewingProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm border bg-[#080808] p-6 shadow-2xl animate-in zoom-in-95 duration-200" style={{ borderColor: themeColor }}>
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                  {viewingProfile.avatar ? <img src={viewingProfile.avatar} className="w-full h-full object-cover" /> : <span className="text-2xl font-black opacity-20">{viewingProfile.username[0]}</span>}
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase text-white">{viewingProfile.username}</h3>
                  <span className={`text-[10px] flex items-center gap-1 font-bold ${viewingProfile.status === 'ONLINE' ? 'text-green-500' : 'text-zinc-600'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span> {viewingProfile.status}
                  </span>
                </div>
              </div>
              <button onClick={() => {setViewingProfile(null); setIsEditingProfile(false);}} className="text-white hover:opacity-50">✕</button>
            </div>
            <div className="space-y-6">
              <div>
                <p className="text-[9px] uppercase font-bold text-zinc-500 mb-2 tracking-widest">Operator_Bio</p>
                {isEditingProfile ? (
                  <textarea className="w-full bg-black border border-zinc-800 p-3 text-sm text-white outline-none focus:border-white" value={bioInput} onChange={(e) => setBioInput(e.target.value)} rows={3} />
                ) : (
                  <p className="text-sm bg-black/40 p-4 border border-zinc-900 italic text-zinc-300">"{viewingProfile.bio}"</p>
                )}
              </div>
              {viewingProfile.username === username ? (
                <button onClick={() => isEditingProfile ? saveProfile() : setIsEditingProfile(true)} className="w-full py-3 bg-white text-black text-[10px] font-black uppercase hover:brightness-75 transition-all">
                  {isEditingProfile ? "COMMIT_CHANGES" : "MODIFY_IDENTITY"}
                </button>
              ) : (
                <button onClick={() => startPrivateChat(viewingProfile.username)} className="w-full py-3 border border-zinc-700 text-[10px] font-black uppercase hover:bg-white hover:text-black transition-all">
                  ESTABLISH_LINK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST & MAIN UI... (omitted for brevity, keep your existing return structure) */}
      {/* Just ensure your GIF form and Send button are inside the main chat view */}
      
      {/* Example integration for the GIF button in your footer */}
      {!showShop && isLoggedIn && (
        <div className="fixed bottom-0 left-0 right-0 p-3 md:p-4 bg-black border-t border-zinc-900">
           {/* GIF Search Result Container */}
           {showGifs && (
              <div className="mb-4 bg-[#0d0d0d] border border-zinc-800 p-4 rounded-sm shadow-2xl animate-in zoom-in-95 duration-200">
                <input className="w-full bg-black border border-zinc-800 p-3 text-sm outline-none text-white mb-4" style={{ borderColor: themeColor }} placeholder="Search Giphy..." value={gifSearch} onChange={(e) => setGifSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchGifs()} />
                <div className="grid grid-cols-3 gap-2 h-40 overflow-y-auto pr-2">
                    {gifs.map((g) => ( <img key={g.id} src={g.images.fixed_height_small.url} className="w-full h-24 object-cover cursor-pointer hover:scale-105 transition-transform rounded-sm" onClick={() => sendGif(g.images.fixed_height.url)} /> ))}
                </div>
              </div>
           )}
           <form onSubmit={sendMessage} className="flex gap-2 items-center">
              <button type="button" onClick={() => {setShowGifs(!showGifs); playSystemBeep(1000, 0.03);}} className={`px-3 md:px-4 py-3 text-[10px] font-black border uppercase transition-all ${showGifs ? "text-black" : "text-zinc-500"}`} style={{ backgroundColor: showGifs ? themeColor : 'transparent', borderColor: showGifs ? themeColor : '#27272a', color: showGifs ? 'black' : 'inherit' } as CSSProperties}>GIF</button>
              <input type="text" className="flex-1 bg-[#0f0f0f] border border-zinc-800 p-3 text-base focus:outline-none text-white transition-all" onFocus={(e) => e.currentTarget.style.borderColor = themeColor} onBlur={(e) => e.currentTarget.style.borderColor = '#27272a'} placeholder={encryptEnabled ? "Secure transmission..." : "Type..." } value={message} onChange={(e) => setMessage(e.target.value)} />
              <button type="submit" className="px-4 md:px-8 py-3 font-black text-[10px] uppercase text-black hover:brightness-110 active:scale-95 transition-all shadow-md" style={{ backgroundColor: themeColor } as CSSProperties}>SEND</button>
           </form>
        </div>
      )}
    </main>
  );
}