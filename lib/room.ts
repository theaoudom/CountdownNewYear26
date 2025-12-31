import { ref, set, onValue, off, push, remove, update } from 'firebase/database'
import { database } from './firebase'

export interface RoomData {
  roomId: string
  roomCode: string
  hostId: string
  createdAt: number
  targetDate: number
  isActive: boolean
}

export interface User {
  id: string
  name: string
  joinedAt: number
}

export interface ChatMessage {
  id: string
  userId: string
  userName: string
  message: string
  timestamp: number
}


// Generate a 6-character room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// Generate a unique user ID
export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

// Helper function to add timeout to Firebase operations
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}


// Create a new room
export async function createRoom(targetDate: number, userName: string): Promise<{ roomId: string; roomCode: string; userId: string }> {
  try {
    const roomId = push(ref(database, 'rooms')).key
    if (!roomId) {
      throw new Error('Failed to generate room ID')
    }
    
    const roomCode = generateRoomCode()
    const userId = generateUserId()
    
    const roomData: RoomData = {
      roomId,
      roomCode,
      hostId: userId,
      createdAt: Date.now(),
      targetDate,
      isActive: true,
    }
    
    // Create room with timeout
    await withTimeout(
      set(ref(database, `rooms/${roomId}`), roomData),
      8000
    )
    
    // Add host as first user
    await withTimeout(
      set(ref(database, `rooms/${roomId}/users/${userId}`), {
        id: userId,
        name: userName || 'Host',
        joinedAt: Date.now(),
      }),
      10000
    )
    
    return { roomId, roomCode, userId }
  } catch (error: any) {
    if (error?.code === 'PERMISSION_DENIED') {
      throw new Error('Permission denied. Please check your Firebase Realtime Database rules allow writes.')
    } else if (error?.code === 'UNAVAILABLE') {
      throw new Error('Database unavailable. Please check your database URL and network connection.')
    } else if (error?.message) {
      throw new Error(`Failed to create room: ${error.message}`)
    } else {
      throw new Error('Failed to create room. Please check your Firebase configuration and database rules.')
    }
  }
}

// Join an existing room
export async function joinRoom(roomCode: string, userName: string): Promise<{ roomId: string; userId: string } | null> {
  // Find room by code
  const roomsRef = ref(database, 'rooms')
  
  return new Promise((resolve, reject) => {
    let resolved = false
    let unsubscribe: (() => void) | null = null
    
    unsubscribe = onValue(roomsRef, (snapshot) => {
      if (resolved) return // Prevent multiple calls
      
      try {
        const rooms = snapshot.val()
        if (!rooms) {
          if (unsubscribe) unsubscribe()
          reject(new Error('Room not found'))
          return
        }
        
        // Find room with matching code
        const roomEntry = Object.entries(rooms).find(
          ([_, room]: [string, any]) => room && room.roomCode === roomCode && room.isActive
        )
        
        if (!roomEntry) {
          if (unsubscribe) unsubscribe()
          reject(new Error('Room not found'))
          return
        }
        
        const [roomId, roomData] = roomEntry as [string, RoomData]
        const userId = generateUserId()
        
        // Unsubscribe immediately to prevent multiple calls
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
        resolved = true
        
        // Add user to room
        set(ref(database, `rooms/${roomId}/users/${userId}`), {
          id: userId,
          name: userName || `User ${userId.slice(-4)}`,
          joinedAt: Date.now(),
        })
          .then(() => {
            resolve({ roomId, userId })
          })
          .catch((error) => {
            reject(error)
          })
      } catch (error) {
        if (unsubscribe) unsubscribe()
        reject(error)
      }
    }, (error) => {
      if (unsubscribe) unsubscribe()
      reject(error)
    })
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved && unsubscribe) {
        unsubscribe()
        reject(new Error('Join room timeout - could not find room'))
      }
    }, 10000)
  })
}

// Subscribe to room updates
export function subscribeToRoom(
  roomId: string,
  callback: (room: RoomData | null, users: User[]) => void
): () => void {
  const roomRef = ref(database, `rooms/${roomId}`)
  
  const unsubscribe = onValue(roomRef, (snapshot) => {
    try {
      const data = snapshot.val()
      if (data) {
        // Safely extract users - handle both object and array formats
        let users: User[] = []
        if (data.users) {
          if (Array.isArray(data.users)) {
            users = data.users.filter((u: any) => u && typeof u === 'object' && u.id)
          } else if (typeof data.users === 'object') {
            // Convert object to array, filter out invalid entries
            users = Object.values(data.users).filter((u: any) => 
              u && typeof u === 'object' && u.id && u.name
            ) as User[]
          }
        }
        callback(data, users)
      } else {
        callback(null, [])
      }
    } catch (error) {
      console.error('Error in subscription callback:', error)
      callback(null, [])
    }
  })
  
  return () => {
    try {
      unsubscribe()
      off(roomRef)
    } catch (error) {
      console.error('Error unsubscribing:', error)
    }
  }
}

// Leave a room
export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const userRef = ref(database, `rooms/${roomId}/users/${userId}`)
  await remove(userRef)
  
  // Check if room is empty and clean up
  const roomRef = ref(database, `rooms/${roomId}`)
  onValue(roomRef, (snapshot) => {
    const data = snapshot.val()
    if (data && (!data.users || Object.keys(data.users).length === 0)) {
      // Room is empty, mark as inactive
      update(ref(database, `rooms/${roomId}`), { isActive: false })
    }
  }, { onlyOnce: true })
}

// Update room target date (host only)
export async function updateRoomTargetDate(roomId: string, targetDate: number): Promise<void> {
  await update(ref(database, `rooms/${roomId}`), { targetDate })
}

// Send a chat message
export async function sendChatMessage(roomId: string, userId: string, userName: string, message: string): Promise<void> {
  if (!message.trim()) return
  
  const messageId = push(ref(database, `rooms/${roomId}/messages`)).key
  if (!messageId) throw new Error('Failed to create message ID')
  
  await set(ref(database, `rooms/${roomId}/messages/${messageId}`), {
    id: messageId,
    userId,
    userName,
    message: message.trim(),
    timestamp: Date.now(),
  })
}

// Subscribe to chat messages
export function subscribeToChat(
  roomId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  const messagesRef = ref(database, `rooms/${roomId}/messages`)
  
  const unsubscribe = onValue(messagesRef, (snapshot) => {
    try {
      const data = snapshot.val()
      if (data) {
        // Convert object to array and sort by timestamp
        const messages = Object.values(data)
          .filter((msg: any) => msg && msg.message && msg.userName)
          .sort((a: any, b: any) => a.timestamp - b.timestamp) as ChatMessage[]
        callback(messages)
      } else {
        callback([])
      }
    } catch (error) {
      console.error('Error in chat subscription:', error)
      callback([])
    }
  })
  
  return () => {
    try {
      unsubscribe()
      off(messagesRef)
    } catch (error) {
      console.error('Error unsubscribing from chat:', error)
    }
  }
}

