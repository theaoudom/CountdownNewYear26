# Welcome 2026 - New Year Countdown 🎉

A beautiful real-time countdown to New Year 2026 with animated fireworks, room system, and chat features.

## ✨ Features

### 🎊 Countdown & Celebration
- ⏰ **Real-time Countdown**: Live countdown timer showing days, hours, minutes, and seconds until 2026
- 🎆 **Animated Fireworks**: Spectacular fireworks display when the countdown reaches zero
- 🌟 **Visual Effects**: Floating stars, glowing orbs, and beautiful gradient backgrounds
- 📱 **Fully Responsive**: Works perfectly on desktop, tablet, and mobile devices

### 👥 Room System
- 🎉 **Create Rooms**: Start your own countdown room and invite friends
- 🔗 **Join Rooms**: Enter a 6-character code to join someone's room
- 🔄 **Synchronized Countdown**: Everyone in the room sees the same countdown timer
- 👑 **Host Badge**: Room creator gets a special host indicator
- 📋 **User List**: See who's celebrating with you in real-time

### 💬 Chat Feature
- 💬 **Real-time Chat**: Chat with everyone in your room
- 📍 **Message History**: See all messages in the conversation
- ⚡ **Auto-scroll**: Automatically scrolls to show the latest messages
- 🎨 **Beautiful UI**: Styled chat bubbles with user names and timestamps

### 🎯 Standalone Mode
- ✨ **Countdown Alone**: Use the countdown without joining a room - perfect for solo celebrations

## 🚀 How to Use

### Option 1: Countdown Alone
1. Open the app
2. Click **"Countdown Alone"** to start your personal countdown
3. Enjoy the countdown and fireworks celebration!

### Option 2: Create a Room
1. Enter your name
2. Click **"Create Room"**
3. You'll get a 6-character room code (e.g., `ABC123`)
4. Share this code with friends
5. Wait for friends to join or start celebrating!

### Option 3: Join a Room
1. Enter your name
2. Click **"Join Room"**
3. Enter the 6-character room code from your friend
4. Start celebrating together!

### Using the Chat
- Once in a room, the chat panel appears at the bottom left
- Type your message and press **Enter** or click **Send**
- See messages from all room members in real-time
- Click the **▼** button to collapse/expand the chat

### Room Features
- **Room Code**: Displayed at the top - share this with friends
- **User Count**: See how many people are in your room
- **Leave Room**: Click "Leave Room" to exit anytime

## 🎨 Special Features

- **Last Minute Mode**: Intense pulsing effects and anticipation in the final minute
- **Final 10 Seconds**: Big number countdown with rocket launch sounds
- **New Year Celebration**: Fireworks, confetti, and surprise messages when 2026 arrives
- **Easter Egg**: Click the year after celebration for a special surprise! 🎁

## 📱 Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Firebase:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - Enable **Realtime Database** (not Firestore)
   - Get your Firebase configuration from Project Settings
   - Update the Firebase config in `lib/firebase.ts` with your credentials

3. **Update Database Rules:**
   - Go to Firebase Console > Realtime Database > Rules
   - Set rules to allow read/write:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
   > ⚠️ **Note**: These rules are for development. Use proper authentication for production.

4. **Run the app:**
   ```bash
   npm run dev
   ```

5. **Open in browser:**
   - Navigate to [http://localhost:3000](http://localhost:3000)

## 🎉 Enjoy!

Celebrate the New Year with friends and family! Create rooms, chat together, and watch the countdown synchronized across all devices.

---

**Happy New Year 2026! 🎊🎆✨**