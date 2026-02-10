# 019_PROTOCOL // SECURE_COMMUNICATION_TERMINAL

![Status](https://img.shields.io/badge/STATUS-OPERATIONAL-brightgreen?style=for-the-badge)
![Security](https://img.shields.io/badge/SECURITY-ENCRYPTED-blueviolet?style=for-the-badge)
![Version](https://img.shields.io/badge/VERSION-2.0.4-orange?style=for-the-badge)

> **"Information is the only currency that matters."**

**Protocol 019** is a high-fidelity, cyberpunk-themed real-time communication platform. Built for operators who demand style, security, and persistence. It features an integrated economy, visual encryption protocols, and self-destructing intelligence.

---

## ⚡ Key Capabilities

### 🔐 Security & Privacy
* **XOR Encryption Layer:** Toggle `SECURE_LINK` to obfuscate outgoing transmissions on the client side.
* **Vanishing Mode:** Activate `AUTO_PURGE` to send self-destructing messages that are wiped from the server and all clients after 30 seconds.
* **Secure Authentication:** JWT-based session management with bcrypt hashing.

### 📡 Intelligence & Comms
* **Real-Time Socket Uplink:** Instant messaging powered by Socket.io.
* **Read Receipts:** Neon indicators (`> SENT` / `>> RECEIVED`) track message delivery status in real-time.
* **Dossier System:** Click any handle to view an Operator's profile, bio, status, and avatar.
* **Media Integration:** Integrated Giphy command line for rich media transmission.

### ⌬ Economy & Customization
* **Virtual Currency (⌬):** Earn credits by contributing to chat channels.
* **Terminal Shop:** Spend ⌬ to unlock and equip high-contrast visual themes:
    * `MATRIX_GREEN` (Default)
    * `BLOOD_PROTOCOL` (Red)
    * `COBALT_STRIKE` (Blue)
    * `ELITE_GOLD` (Yellow/Premium)

---

## 🛠️ Tech Stack

**Frontend Interface**
* **Next.js 14** (React Framework)
* **Tailwind CSS** (Utility-first styling)
* **Socket.io Client** (Real-time events)

**Backend Core**
* **Node.js & Express** (Server runtime)
* **Socket.io** (WebSocket engine)
* **MongoDB & Mongoose** (Persistence layer)
* **JWT & Bcrypt** (Auth security)

---

## 🚀 Installation & Deployment

### 1. Clone the Repository
```bash
git clone [https://github.com/your-username/protocol-019.git](https://github.com/your-username/protocol-019.git)
cd protocol-019
