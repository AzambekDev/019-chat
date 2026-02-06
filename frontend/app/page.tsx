"use client";
import { useEffect, useState, useRef } from "react";
import { socket } from "@/lib/socket";

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<any[]>([]); // Changed to any[] to handle objects
  const [username, setUsername] = useState("");
  const [hasUsername, setHasUsername] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat]);

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socket.on("load_messages", (messages: any[]) => {
      setChat(messages);
    });

    socket.on("receive_message", (data: any) => {
      setChat((prev) => [...prev, data]);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("load_messages");
      socket.off("receive_message");
    };
  }, []);

  const sendData = () => {
    if (message.trim()) {
      socket.emit("send_message", {
        user: username || "Anonymous",
        text: message,
      });
      setMessage("");
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4 font-mono">
      <h1 className="text-4xl font-bold mb-4 tracking-tighter text-white">019_PROTOCOL</h1>

      {!hasUsername ? (
        /* --- LOGIN OVERLAY --- */
        <div className="w-full max-w-md p-6 border border-zinc-800 bg-zinc-900/50 rounded-lg shadow-xl">
          <div className="mb-6">
            <p className="text-[10px] text-green-500 uppercase tracking-[0.3em] mb-1">Identity_Handshake</p>
            <p className="text-zinc-500 text-[10px]">AUTH_REQUIRED: ENTER_OPERATOR_HANDLE</p>
          </div>
          
          <div className="flex flex-col gap-3">
            <input
              type="text"
              autoFocus
              placeholder="OPERATOR_ID"
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && username && setHasUsername(true)}
              className="bg-black border border-zinc-700 p-3 text-white outline-none focus:border-green-500 transition-all placeholder:text-zinc-800"
            />
            <button
              onClick={() => username && setHasUsername(true)}
              className="bg-white text-black font-bold py-3 hover:bg-zinc-200 transition-colors uppercase text-xs tracking-widest"
            >
              Initialize_Link
            </button>
          </div>
        </div>
      ) : (
        /* --- ACTIVE CHAT INTERFACE --- */
        <>
          <div className="w-full max-w-md flex justify-between items-center mb-2 px-1">
            <div className={`text-[10px] ${isConnected ? "text-green-500" : "text-red-500"}`}>
              {isConnected ? "● SYSTEM_ONLINE" : "○ SYSTEM_OFFLINE"}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase">Operator: {username}</div>
          </div>

          <div 
            ref={scrollRef}
            className="w-full max-w-md border border-zinc-800 rounded-lg p-4 h-80 overflow-y-auto mb-4 bg-zinc-900/50 scroll-smooth shadow-inner"
          >
            {chat.length === 0 && (
              <p className="text-zinc-700 text-xs italic text-center mt-4">Initializing logs...</p>
            )}
            {chat.map((msg: any, i) => (
              <div key={i} className="mb-2 font-mono text-sm border-b border-zinc-800/30 pb-1 flex flex-col">
                <span className="text-green-500 text-[10px] font-bold uppercase tracking-tighter">
                  [{msg.sender || msg.user || "Unknown"}]
                </span>
                <span className="text-zinc-300">{msg.text}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 w-full max-w-md">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendData()}
              className="flex-1 bg-zinc-800 border border-zinc-700 p-2 rounded outline-none focus:border-green-500 text-white font-mono text-sm"
              placeholder="Enter command..."
            />
            <button 
              onClick={sendData} 
              className="bg-white text-black px-4 py-2 rounded font-bold hover:bg-zinc-200 transition-colors text-xs"
            >
              SEND
            </button>
          </div>
        </>
      )}
    </main>
  );
}