'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createRoom, joinRoom, subscribeToRoom, leaveRoom, kickUser, sendChatMessage, subscribeToChat, generateUserId, type RoomData, type User, type ChatMessage } from '@/lib/room'
import { commonEmojis } from '@/lib/emojis'
import { database } from '@/lib/firebase'
import { ref, get, update } from 'firebase/database'
import { WebRTCManager, type CallState } from '@/lib/webrtc'

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

interface ConfettiPiece {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  color: string
  size: number
  shape: 'circle' | 'square'
}

export default function Home() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  })
  const [isNewYear, setIsNewYear] = useState(false)
  const [showFireworks, setShowFireworks] = useState(false)
  const [showMessage, setShowMessage] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [easterEggActive, setEasterEggActive] = useState(false)
  const [randomMessage, setRandomMessage] = useState('')
  const [showDecorations, setShowDecorations] = useState(false)
  const [lastMinute, setLastMinute] = useState(false)
  const [last10Seconds, setLast10Seconds] = useState(false)
  const [bigCountdownNumber, setBigCountdownNumber] = useState(10)
  const [bigFireworkY, setBigFireworkY] = useState(0)
  const [show2026Explosion, setShow2026Explosion] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)
  const bigFireworkCanvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const confettiRef = useRef<ConfettiPiece[]>([])
  const animationFrameRef = useRef<number>()
  const confettiAnimationRef = useRef<number>()
  const bigFireworkAnimationRef = useRef<number>()
  const lastSoundTimeRef = useRef<number>(0)
  const lastCountdownNumberRef = useRef<number>(-1)
  const rocketLaunchSoundPlayedRef = useRef<boolean>(false)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  
  // Room state
  const [roomId, setRoomId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [roomUsers, setRoomUsers] = useState<User[]>([])
  const [showRoomModal, setShowRoomModal] = useState(true)
  const [roomAction, setRoomAction] = useState<'create' | 'join' | null>(null)
  const [userName, setUserName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [roomTargetDate, setRoomTargetDate] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  // Save room data to localStorage
  const saveRoomData = useCallback((data: { roomId: string; roomCode: string; userId: string; userName: string }) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('welcome2026_room', JSON.stringify(data))
    }
  }, [])
  
  // Load room data from localStorage
  const loadRoomData = useCallback((): { roomId: string; roomCode: string; userId: string; userName: string } | null => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('welcome2026_room')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          console.error('Failed to parse saved room data:', e)
          localStorage.removeItem('welcome2026_room')
        }
      }
    }
    return null
  }, [])
  
  // Clear room data from localStorage
  const clearRoomData = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('welcome2026_room')
    }
  }, [])
  
  // Restore room connection on page load
  useEffect(() => {
    const restoreRoom = async () => {
      const savedData = loadRoomData()
      if (!savedData) return
      
      const { roomId: savedRoomId, roomCode: savedRoomCode, userId: savedUserId, userName: savedUserName } = savedData
      
      // Verify user is still in the room
      try {
        const roomRef = ref(database, `rooms/${savedRoomId}`)
        const roomSnapshot = await get(roomRef)
        const roomData = roomSnapshot.val()
        
        if (!roomData || !roomData.isActive) {
          // Room doesn't exist or is inactive
          clearRoomData()
          return
        }
        
        // Check if user still exists in room
        const usersRef = ref(database, `rooms/${savedRoomId}/users/${savedUserId}`)
        const userSnapshot = await get(usersRef)
        const userData = userSnapshot.val()
        
        if (!userData) {
          // User was removed from room
          clearRoomData()
          return
        }
        
        // Restore room connection
        setRoomId(savedRoomId)
        setRoomCode(savedRoomCode)
        setUserId(savedUserId)
        setUserName(savedUserName)
        setShowRoomModal(false)
        
        // Update user's joinedAt timestamp to show they're active
        await update(ref(database, `rooms/${savedRoomId}/users/${savedUserId}`), {
          joinedAt: Date.now(),
        })
      } catch (error) {
        console.error('Failed to restore room:', error)
        clearRoomData()
      }
    }
    
    restoreRoom()
  }, [loadRoomData, clearRoomData])
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [showChat, setShowChat] = useState(true)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  
  // Users list state
  const [showUsersList, setShowUsersList] = useState(true)
  const [showRoomActionsMenu, setShowRoomActionsMenu] = useState(false)

  // Call state
  const [callState, setCallState] = useState<CallState | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [connectionStatuses, setConnectionStatuses] = useState<Map<string, { status: string; iceConnectionState: string; connectionState: string }>>(new Map())
  const [showCallModal, setShowCallModal] = useState(false)
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null)
  const webrtcManagerRef = useRef<WebRTCManager | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  // Surprise messages - randomly selected
  const surpriseMessages = [
    "New year, new opportunities ✨",
    "You made it through 2025. Proud of you! 💪",
    "This is your year. Let's go! 💫",
    "Small steps, big changes. Happy 2026! 🌟",
    "Dream big, start small. Welcome 2026! 🚀",
    "Every moment is a fresh beginning. Cheers! 🥂",
    "Your journey continues. Make it amazing! ⭐",
    "Here's to new adventures and endless possibilities! 🎊",
  ]

  // TEST MODE: Set to true to test with a date closer to now
  // Change TEST_TARGET_DATE to your desired test date
  const TEST_MODE = false // Set to false for production (Jan 1, 2026)
  const TEST_TARGET_DATE = '2025-12-31T10:39:00' // December 31, 2025, 9:33 AM
  
  // Target date: January 1, 2026, 00:00:00 (production)
  // Or test date if TEST_MODE is enabled
  // Use room target date if in a room, otherwise use default
  const defaultTargetDate = TEST_MODE 
    ? new Date(TEST_TARGET_DATE).getTime()
    : new Date('2026-01-01T00:00:00').getTime()
  const targetDate = roomTargetDate || defaultTargetDate

  // Function to play rocket launch sound
  const playRocketLaunchSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // Rocket launch sound: starts low and goes high (whoosh effect)
      oscillator.type = 'sawtooth' // More aggressive sound
      oscillator.frequency.setValueAtTime(100, audioContext.currentTime) // Start low
      oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 1.5) // Go high
      
      // Volume envelope: fade in then fade out
      gainNode.gain.setValueAtTime(0, audioContext.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.1) // Quick fade in
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 1.0) // Sustain
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.5) // Fade out
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 1.5)
    } catch (e) {
      console.warn('Rocket launch sound not supported:', e)
    }
  }, [])

  // Function to play countdown sound (10, 9, 8, 7, 6, 5, 4, 3, 2, 1)
  const playCountdownSound = useCallback((number: number) => {
    if (number < 1 || number > 10) return
    
    try {
      // First, play an immediate beep sound for perfect synchronization
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // Short beep tone
      oscillator.frequency.value = 800 // Higher pitch for countdown
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
      
      // Then speak the number with Web Speech API
      if ('speechSynthesis' in window) {
        // Cancel any ongoing speech immediately
        window.speechSynthesis.cancel()
        
        const utterance = new SpeechSynthesisUtterance(number.toString())
        utterance.rate = 1.8 // Very fast rate to match countdown timing
        utterance.pitch = 1.0 // Normal pitch
        utterance.volume = 0.7
        
        // Start speech immediately after beep
        setTimeout(() => {
          window.speechSynthesis.speak(utterance)
        }, 50) // Small delay to let beep play first
      }
    } catch (e) {
      console.warn('Countdown sound not supported:', e)
    }
  }, [])

  // Room management functions
  const handleCreateRoom = async () => {
    if (!userName.trim()) {
      setErrorMessage('Please enter your name')
      setTimeout(() => setErrorMessage(null), 3000)
      return
    }
    
    setIsLoading(true)
    setErrorMessage(null)
    
    try {
      console.log('Creating room with targetDate:', targetDate)
      const result = await createRoom(targetDate, userName.trim())
      console.log('Room created successfully:', result)
      setRoomId(result.roomId)
      setRoomCode(result.roomCode)
      setUserId(result.userId)
      setIsHost(true)
      setShowRoomModal(false)
      
      // Save room data to localStorage
      saveRoomData({
        roomId: result.roomId,
        roomCode: result.roomCode,
        userId: result.userId,
        userName: userName.trim(),
      })
    } catch (error: any) {
      console.error('Failed to create room:', error)
      console.error('Full error object:', error)
      const errorMsg = error?.message || 'Failed to create room. Please check your Firebase configuration and try again.'
      setErrorMessage(errorMsg)
      // Don't show alert, just show error in UI
      console.error('Error message:', errorMsg)
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleJoinRoom = async () => {
    if (!userName.trim()) {
      setErrorMessage('Please enter your name')
      setTimeout(() => setErrorMessage(null), 3000)
      return
    }
    if (!joinCode.trim() || joinCode.trim().length !== 6) {
      setErrorMessage('Please enter a valid 6-character room code')
      setTimeout(() => setErrorMessage(null), 3000)
      return
    }
    
    setIsLoading(true)
    setErrorMessage(null)
    
    try {
      console.log('Joining room with code:', joinCode.trim().toUpperCase())
      const result = await joinRoom(joinCode.trim().toUpperCase(), userName.trim())
      if (result) {
        console.log('Joined room successfully:', result)
        setRoomId(result.roomId)
        setRoomCode(joinCode.trim().toUpperCase())
        setUserId(result.userId)
        setIsHost(false)
        setShowRoomModal(false)
        
        // Save room data to localStorage
        saveRoomData({
          roomId: result.roomId,
          roomCode: joinCode.trim().toUpperCase(),
          userId: result.userId,
          userName: userName.trim(),
        })
      }
    } catch (error: any) {
      console.error('Failed to join room:', error)
      const errorMsg = error?.message || 'Failed to join room. Please check the room code and try again.'
      setErrorMessage(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleLeaveRoom = async () => {
    // End call if active
    if (webrtcManagerRef.current && callState?.isInCall) {
      await handleEndCall()
    }
    
    if (roomId && userId) {
      try {
        await leaveRoom(roomId, userId)
      } catch (error) {
        console.error('Failed to leave room:', error)
      }
    }
    setRoomId(null)
    setRoomCode(null)
    setUserId(null)
    setIsHost(false)
    setRoomUsers([])
    setRoomTargetDate(null)
    setShowRoomModal(true)
    setRoomAction(null)
    
    // Clear room data from localStorage
    clearRoomData()
  }
  
  // Subscribe to room updates
  useEffect(() => {
    if (!roomId || !userId) return
    
    let isSubscribed = true
    
    const unsubscribe = subscribeToRoom(roomId, (room: RoomData | null, users: User[]) => {
      if (!isSubscribed) return // Prevent updates after unmount
      
      try {
        if (room) {
          // Only update if users array is valid
          if (Array.isArray(users)) {
            setRoomUsers(users)
          } else {
            console.warn('Invalid users data:', users)
            setRoomUsers([])
          }
          
          // Check if current user is the host
          setIsHost(room.hostId === userId)
          
          // Update target date from room if it exists
          if (room.targetDate) {
            setRoomTargetDate(room.targetDate)
          }
        } else {
          // Room was deleted
          console.log('Room was deleted, leaving...')
          handleLeaveRoom()
        }
      } catch (error) {
        console.error('Error in room subscription callback:', error)
      }
    })
    
    return () => {
      isSubscribed = false
      unsubscribe()
    }
  }, [roomId, userId])
  
  // Subscribe to chat messages
  useEffect(() => {
    if (!roomId) return
    
    const unsubscribe = subscribeToChat(roomId, (messages: ChatMessage[]) => {
      setChatMessages(messages)
    })
    
    return () => {
      unsubscribe()
    }
  }, [roomId])
  
  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    if (chatMessagesEndRef.current && showChat) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, showChat])
  
  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showEmojiPicker && !target.closest('.emoji-picker-container')) {
        setShowEmojiPicker(false)
      }
    }
    
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmojiPicker])

  // Close room actions menu when clicking outside (mobile)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (showRoomActionsMenu && !target.closest('.room-actions-container')) {
        setShowRoomActionsMenu(false)
      }
    }
    
    if (showRoomActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showRoomActionsMenu])
  
  // Handle sending chat message
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !roomId || !userId || !userName) return
    
    try {
      await sendChatMessage(roomId, userId, userName, chatInput)
      setChatInput('')
      setShowEmojiPicker(false)
      // Scroll to bottom after sending
      setTimeout(() => {
        if (chatMessagesEndRef.current) {
          chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
      }, 100)
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }
  
  // Handle emoji selection
  const handleEmojiClick = (emoji: string) => {
    setChatInput(prev => prev + emoji)
    setShowEmojiPicker(false)
  }
  
  // Initialize WebRTC manager when in a room
  useEffect(() => {
    if (roomId && userId && !webrtcManagerRef.current) {
      webrtcManagerRef.current = new WebRTCManager(roomId, userId)
      
      webrtcManagerRef.current.onStateChange((state) => {
        setCallState(state)
      })
      
      webrtcManagerRef.current.onRemoteStream((userId, stream) => {
        console.log(`Remote stream received from ${userId}`, {
          id: stream.id,
          active: stream.active,
          audioTracks: stream.getAudioTracks().map(t => ({
            enabled: t.enabled,
            readyState: t.readyState,
            muted: t.muted,
          })),
          videoTracks: stream.getVideoTracks().map(t => ({
            enabled: t.enabled,
            readyState: t.readyState,
            muted: t.muted,
          })),
        })
        
        // Ensure audio tracks are enabled
        stream.getAudioTracks().forEach(track => {
          if (!track.enabled) {
            console.log(`Enabling audio track from ${userId}`)
            track.enabled = true
          }
        })
        
        setRemoteStreams(prev => {
          const newMap = new Map(prev)
          newMap.set(userId, stream)
          return newMap
        })
        
        // Update video element immediately and after a short delay
        const updateVideoElement = () => {
          const videoElement = remoteVideoRefs.current.get(userId)
          if (videoElement && stream) {
            if (videoElement.srcObject !== stream) {
              videoElement.srcObject = stream
              console.log(`Updated video element for ${userId}`)
            }
            // Ensure autoplay and unmuted for audio
            videoElement.muted = false
            videoElement.play().catch(err => {
              console.warn(`Failed to play video for ${userId}:`, err)
            })
          }
        }
        
        updateVideoElement()
        setTimeout(updateVideoElement, 100)
        setTimeout(updateVideoElement, 500)
      })
      
      webrtcManagerRef.current.onRemoteStreamRemoved((userId) => {
        setRemoteStreams(prev => {
          const newMap = new Map(prev)
          newMap.delete(userId)
          return newMap
        })
      })
      
      webrtcManagerRef.current.onConnectionStatusChange((userId, status) => {
        console.log(`Connection status for ${userId}:`, status)
        setConnectionStatuses(prev => {
          const newMap = new Map(prev)
          newMap.set(userId, status)
          return newMap
        })
      })
    }
    
    return () => {
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.destroy()
        webrtcManagerRef.current = null
      }
    }
  }, [roomId, userId])

  // Update local video element when stream changes
  useEffect(() => {
    if (localVideoRef.current && callState?.localStream) {
      if (localVideoRef.current.srcObject !== callState.localStream) {
        localVideoRef.current.srcObject = callState.localStream
        // Ensure autoplay on mobile
        localVideoRef.current.play().catch(err => {
          console.warn('Failed to play local video:', err)
        })
      }
    } else if (localVideoRef.current && !callState?.localStream) {
      localVideoRef.current.srcObject = null
    }
  }, [callState?.localStream])

  // Handle starting a call
  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!webrtcManagerRef.current) return
    
    try {
      setCallType(type)
      await webrtcManagerRef.current.startCall(type === 'video', true)
      setShowCallModal(true)
    } catch (error) {
      console.error('Failed to start call:', error)
      setErrorMessage('Failed to start call. Please check your camera/microphone permissions.')
      setTimeout(() => setErrorMessage(null), 5000)
    }
  }

  // Handle ending a call
  const handleEndCall = async () => {
    if (webrtcManagerRef.current) {
      await webrtcManagerRef.current.endCall()
      setShowCallModal(false)
      setCallType(null)
      setRemoteStreams(new Map())
    }
  }

  // Handle toggling video
  const handleToggleVideo = () => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.toggleVideo()
    }
  }

  // Handle toggling audio
  const handleToggleAudio = () => {
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.toggleAudio()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomId && userId) {
        leaveRoom(roomId, userId).catch(console.error)
      }
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.destroy()
      }
    }
  }, [])
  
  // Function to play firework sound - uses only /sound/firework-sound.webm
  // Throttled to prevent too many sounds
  const playFireworkSound = useCallback((type: 'normal' | 'big' = 'normal') => {
    const now = Date.now()
    const timeSinceLastSound = now - lastSoundTimeRef.current
    
    // Throttle: minimum time between sounds
    const minInterval = type === 'big' ? 500 : 1400 // Big fireworks: 500ms, normal: 1200ms
    
    // For normal fireworks, only play 30% of the time (to reduce annoyance)
    if (type === 'normal' && Math.random() > 0.3) {
      return
    }
    
    // Check if enough time has passed
    if (timeSinceLastSound < minInterval) {
      return
    }
    
    try {
      // Create a new audio instance for each firework
      // Only uses the provided sound file: /sound/firework-sound.webm
      const audio = new Audio('/sound/firework-sound.webm')
      audio.volume = type === 'big' ? 0.5 : 0.25 // Reduced volume
      
      // Update last sound time
      lastSoundTimeRef.current = now
      
      // Play the sound
      audio.play().catch((error) => {
        // Handle autoplay restrictions - user interaction may be required
        console.warn('Could not play audio:', error)
      })
      
      // Clean up after sound finishes playing
      audio.addEventListener('ended', () => {
        audio.remove()
      })
    } catch (e) {
      console.warn('Audio not supported:', e)
    }
  }, [])

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime()
      const difference = targetDate - now

      if (difference <= 0) {
        setIsNewYear(true)
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        setLast10Seconds(false)
        setLastMinute(false)
        setBigCountdownNumber(0)
        
        // Explode big firework and show 2026
        setShow2026Explosion(true)
        
        // Enable fireworks canvas early for welcome fireworks
        setShowFireworks(true)
        
        // Launch multiple small welcome fireworks - warm welcome effect
        setTimeout(() => {
          const launchWelcomeFireworks = () => {
            // Use setTimeout to ensure canvas is ready
            setTimeout(() => {
              if (canvasRef.current) {
                const canvas = canvasRef.current
                const ctx = canvas.getContext('2d')
                if (ctx) {
                  // Launch 5 small fireworks from different positions (reduced from 10)
                  for (let i = 0; i < 5; i++) {
                    setTimeout(() => {
                      const x = (canvas.width / 6) * (i + 1) // Spread across screen
                      const y = canvas.height
                      const targetY = 150 + Math.random() * (canvas.height * 0.4)
                      
                      // Animate rocket going up
                      const rocketSpeed = 12
                      let rocketY = y
                      const rocketInterval = setInterval(() => {
                        rocketY -= rocketSpeed
                        if (rocketY <= targetY) {
                          clearInterval(rocketInterval)
                          
                          // Play firework sound
                          playFireworkSound('normal')
                          
                          // Create explosion with fewer particles
                          const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#F7DC6F', '#BB8FCE', '#F8B739', '#E74C3C', '#FFD700', '#FF1493', '#00CED1']
                          const particleCount = 40 + Math.random() * 30 // Reduced from 70-120 to 40-70
                          
                          for (let j = 0; j < particleCount; j++) {
                            const angle = (Math.PI * 2 * j) / particleCount + Math.random() * 0.5
                            const speed = 4 + Math.random() * 6
                            const color = colors[Math.floor(Math.random() * colors.length)]
                            
                            particlesRef.current.push({
                              x: x,
                              y: rocketY,
                              vx: Math.cos(angle) * speed,
                              vy: Math.sin(angle) * speed,
                              life: 1,
                              maxLife: 1,
                              color,
                              size: 3 + Math.random() * 5,
                            })
                          }
                        }
                      }, 16)
                    }, i * 250) // Stagger the launches (reduced frequency - increased from 120ms to 250ms)
                  }
                }
              }
            }, 100)
          }
          
          launchWelcomeFireworks()
        }, 600) // Start 0.6s after big explosion
        
        // Staged reveal sequence (without bright flash)
        // Step 1: Show main message (after 2026 explosion)
        setTimeout(() => {
          setShowMessage(true)
        }, 2000)
        
        // Step 3: Show confetti (3 seconds later)
        setTimeout(() => {
          setShowConfetti(true)
        }, 3000)
        
        // Step 4: Show floating decorations (3.5 seconds later)
        setTimeout(() => {
          setShowDecorations(true)
        }, 3500)
        
        // Step 5: Random surprise message (4 seconds later)
        setTimeout(() => {
          const randomIndex = Math.floor(Math.random() * surpriseMessages.length)
          setRandomMessage(surpriseMessages[randomIndex])
        }, 4000)
        
        return
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24))
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((difference % (1000 * 60)) / 1000)

      // Check if we're in the last minute or last 10 seconds
      const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds
      if (totalSeconds <= 10 && totalSeconds > 0) {
        setLast10Seconds(true)
        setLastMinute(false) // Last 10 seconds takes priority
        setBigCountdownNumber(seconds)
        
        // Play countdown sound when number changes - trigger immediately
        if (lastCountdownNumberRef.current !== seconds) {
          lastCountdownNumberRef.current = seconds
          // Trigger sound immediately using requestAnimationFrame for better timing
          requestAnimationFrame(() => {
            playCountdownSound(seconds)
          })
        }
      } else if (totalSeconds <= 60 && totalSeconds > 10) {
        setLastMinute(true)
        setLast10Seconds(false)
        lastCountdownNumberRef.current = -1 // Reset countdown number
      } else if (totalSeconds > 60) {
        setLastMinute(false)
        setLast10Seconds(false)
        lastCountdownNumberRef.current = -1 // Reset countdown number
      }

      setTimeLeft({ days, hours, minutes, seconds })
    }

    // Calculate immediately
    calculateTimeLeft()

    // Update every second
    const interval = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(interval)
  }, [targetDate, playCountdownSound])

  // Fireworks animation
  useEffect(() => {
    if (!showFireworks || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Create a new firework explosion
    const createFirework = (x: number, y: number) => {
      // Play firework sound
      playFireworkSound('normal')
      
      const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#E74C3C'
      ]
      const particleCount = 30 + Math.random() * 20 // Reduced from 50-80 to 30-50

      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5
        const speed = 2 + Math.random() * 4
        const color = colors[Math.floor(Math.random() * colors.length)]

        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 1,
          color,
          size: 2 + Math.random() * 3,
        })
      }
    }

    // Launch firework from bottom
    const launchFirework = () => {
      const x = Math.random() * canvas.width
      const y = canvas.height
      const targetY = 100 + Math.random() * (canvas.height * 0.4)

      // Animate rocket going up
      const rocketSpeed = 8
      let rocketY = y
      const rocketInterval = setInterval(() => {
        rocketY -= rocketSpeed
        if (rocketY <= targetY) {
          clearInterval(rocketInterval)
          createFirework(x, rocketY)
        }
      }, 16)
    }

    // Launch initial fireworks
    launchFirework()
    const fireworkInterval = setInterval(() => {
      if (Math.random() > 0.6) { // Reduced from 0.3 to 0.6 (40% chance instead of 70%)
        launchFirework()
      }
    }, 4000) // Increased from 2000ms to 4000ms (every 4 seconds instead of 2)

    // Animation loop
    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.15 // Gravity
        particle.vx *= 0.98 // Friction
        particle.life -= 0.02

        if (particle.life > 0) {
          const alpha = particle.life
          ctx.globalAlpha = alpha
          ctx.fillStyle = particle.color
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
          ctx.fill()
          return true
        }
        return false
      })

      ctx.globalAlpha = 1
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      clearInterval(fireworkInterval)
      window.removeEventListener('resize', resizeCanvas)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [showFireworks])

  // Confetti animation
  useEffect(() => {
    if (!showConfetti || !confettiCanvasRef.current) return

    const canvas = confettiCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Create confetti pieces
    const createConfetti = () => {
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#F7DC6F', '#BB8FCE', '#F8B739']
      const count = 100

      for (let i = 0; i < count; i++) {
        confettiRef.current.push({
          x: Math.random() * canvas.width,
          y: -10,
          vx: (Math.random() - 0.5) * 2,
          vy: 1 + Math.random() * 3,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 5 + Math.random() * 8,
          shape: Math.random() > 0.5 ? 'circle' : 'square',
        })
      }
    }

    createConfetti()

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      confettiRef.current = confettiRef.current.filter((piece) => {
        piece.x += piece.vx
        piece.y += piece.vy
        piece.vy += 0.1 // Gravity
        piece.rotation += piece.rotationSpeed

        if (piece.y < canvas.height + 50) {
          ctx.save()
          ctx.translate(piece.x, piece.y)
          ctx.rotate((piece.rotation * Math.PI) / 180)
          ctx.fillStyle = piece.color
          
          if (piece.shape === 'circle') {
            ctx.beginPath()
            ctx.arc(0, 0, piece.size, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size)
          }
          
          ctx.restore()
          return true
        }
        return false
      })

      // Add more confetti occasionally
      if (Math.random() > 0.95 && confettiRef.current.length < 200) {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#F7DC6F', '#BB8FCE', '#F8B739']
        confettiRef.current.push({
          x: Math.random() * canvas.width,
          y: -10,
          vx: (Math.random() - 0.5) * 2,
          vy: 1 + Math.random() * 3,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 5 + Math.random() * 8,
          shape: Math.random() > 0.5 ? 'circle' : 'square',
        })
      }

      confettiAnimationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (confettiAnimationRef.current) {
        cancelAnimationFrame(confettiAnimationRef.current)
      }
    }
  }, [showConfetti])

  // Big firework rocket animation (last 10 seconds)
  useEffect(() => {
    if ((!last10Seconds && !show2026Explosion) || !bigFireworkCanvasRef.current) {
      setBigFireworkY(0)
      rocketLaunchSoundPlayedRef.current = false // Reset launch sound flag
      return
    }

    const canvas = bigFireworkCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Launch rocket from bottom center - launch much higher
    const centerX = canvas.width / 2
    const startY = canvas.height
    const targetY = canvas.height * 0.15 // Launch much higher (15% from top)
    let rocketY = startY
    let explosionParticles: Array<{x: number, y: number, vx: number, vy: number, life: number, color: string, size: number}> = []
    let explosionTime = 0

    // Play launch sound when rocket starts (only once)
    if (last10Seconds && !rocketLaunchSoundPlayedRef.current && !show2026Explosion) {
      rocketLaunchSoundPlayedRef.current = true
      playRocketLaunchSound()
    }

    // Initialize explosion particles when explosion starts - MUCH BIGGER
    if (show2026Explosion && explosionParticles.length === 0) {
      // Play big firework sound
      playFireworkSound('big')
      
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#F7DC6F', '#BB8FCE', '#F8B739', '#E74C3C', '#FFD700', '#FF1493', '#00CED1', '#FF69B4']
      const particleCount = 500 // Much more particles for bigger explosion
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5
        const speed = 4 + Math.random() * 10 // Faster particles
        explosionParticles.push({
          x: centerX,
          y: targetY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 4 + Math.random() * 8, // Bigger particles
        })
      }
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (!show2026Explosion && rocketY > targetY) {
        // Draw rocket trail
        const trailLength = 30
        const gradient = ctx.createLinearGradient(centerX, rocketY, centerX, rocketY + trailLength)
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
        gradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.6)')
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)')
        ctx.fillStyle = gradient
        ctx.fillRect(centerX - 2, rocketY, 4, trailLength)

        // Draw rocket body - bigger rocket
        ctx.fillStyle = '#FFD700'
        ctx.beginPath()
        ctx.arc(centerX, rocketY, 12, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#FF6B00'
        ctx.beginPath()
        ctx.arc(centerX, rocketY, 8, 0, Math.PI * 2)
        ctx.fill()
        
        // Add glow to rocket
        ctx.shadowBlur = 20
        ctx.shadowColor = '#FFD700'
        ctx.beginPath()
        ctx.arc(centerX, rocketY, 12, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0

        // Move rocket up (reach target in ~10 seconds)
        rocketY -= (startY - targetY) / (10 * 60) // 60fps, 10 seconds
        setBigFireworkY(rocketY)
        bigFireworkAnimationRef.current = requestAnimationFrame(animate)
      } else if (show2026Explosion) {
        // Explode with "2026" text
        const explosionX = centerX
        const explosionY = targetY

        // Update and draw explosion particles
        explosionParticles = explosionParticles.filter((particle) => {
          particle.x += particle.vx
          particle.y += particle.vy
          particle.vy += 0.1 // Gravity
          particle.vx *= 0.98 // Friction
          particle.life -= 0.015

          if (particle.life > 0) {
            ctx.globalAlpha = particle.life
            ctx.fillStyle = particle.color
            ctx.beginPath()
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
            ctx.fill()
            return true
          }
          return false
        })

        // Draw "2026" text in the center (fade in) - MUCH BIGGER
        explosionTime += 0.02
        const textAlpha = Math.min(explosionTime, 1)
        const textScale = Math.min(explosionTime * 1.2, 1) // Scale up animation
        
        ctx.save()
        ctx.globalAlpha = textAlpha
        ctx.translate(explosionX, explosionY)
        ctx.scale(textScale, textScale)
        ctx.translate(-explosionX, -explosionY)
        
        ctx.fillStyle = '#FFD700'
        ctx.strokeStyle = '#FF6B00'
        ctx.lineWidth = 12
        ctx.font = 'bold 180px Arial' // Much bigger text
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.strokeText('2026', explosionX, explosionY)
        ctx.fillText('2026', explosionX, explosionY)
        
        // Add glow effect
        ctx.shadowBlur = 50
        ctx.shadowColor = '#FFD700'
        ctx.fillText('2026', explosionX, explosionY)
        ctx.restore()

        // Continue animation for a few seconds
        if (explosionTime < 3) {
          bigFireworkAnimationRef.current = requestAnimationFrame(animate)
        }
      }
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (bigFireworkAnimationRef.current) {
        cancelAnimationFrame(bigFireworkAnimationRef.current)
      }
    }
  }, [last10Seconds, show2026Explosion, playRocketLaunchSound])

  // Easter egg handler
  const handleEasterEgg = () => {
    if (!isNewYear) return
    
    setEasterEggActive(true)
    
    // Trigger extra intense fireworks burst
    if (canvasRef.current && showFireworks) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Create multiple explosions at once (reduced from 5 to 3)
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            const x = Math.random() * canvas.width
            const y = 100 + Math.random() * (canvas.height * 0.5)
            
            // Play firework sound
            playFireworkSound('normal')
            
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#F7DC6F', '#BB8FCE', '#F8B739', '#E74C3C']
            const particleCount = 60 // Reduced from 80 to 60
            
            for (let j = 0; j < particleCount; j++) {
              const angle = (Math.PI * 2 * j) / particleCount + Math.random() * 0.5
              const speed = 3 + Math.random() * 5
              const color = colors[Math.floor(Math.random() * colors.length)]
              
              particlesRef.current.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                maxLife: 1,
                color,
                size: 3 + Math.random() * 4,
              })
            }
          }, i * 200)
        }
      }
    }
    
    // Reset easter egg after 3 seconds
    setTimeout(() => setEasterEggActive(false), 3000)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-black via-purple-900 to-black flex items-center justify-center">
      {/* Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-purple-900/90 to-black/90 rounded-2xl p-8 max-w-md w-full border border-purple-500/30 shadow-2xl">
            <h2 className="text-3xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500">
              🎉 Welcome to 2026 Countdown! 🎉
            </h2>
            
            {!roomAction ? (
              <div className="space-y-4">
                <p className="text-center text-gray-300 text-sm mb-2">
                  Choose how you want to celebrate:
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setRoomAction('create')}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold text-white hover:from-purple-500 hover:to-pink-500 transition-all transform hover:scale-105"
                  >
                    Create Room
                  </button>
                  <button
                    onClick={() => setRoomAction('join')}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-semibold text-white hover:from-blue-500 hover:to-purple-500 transition-all transform hover:scale-105"
                  >
                    Join Room
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-600"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-purple-900/90 px-2 text-gray-400">or</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowRoomModal(false)}
                  className="w-full px-6 py-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg font-semibold text-white transition-all border border-gray-600 hover:border-gray-500"
                >
                  Countdown Alone ✨
                </button>
                <p className="text-center text-gray-400 text-xs">
                  You can always join or create a room later
                </p>
              </div>
            ) : roomAction === 'create' ? (
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-lg bg-purple-800/50 border border-purple-500/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {errorMessage && (
                  <div className="px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
                    {errorMessage}
                  </div>
                )}
                <button
                  onClick={handleCreateRoom}
                  disabled={isLoading}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold text-white hover:from-purple-500 hover:to-pink-500 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isLoading ? 'Creating Room...' : 'Create & Start'}
                </button>
                <button
                  onClick={() => {
                    setRoomAction(null)
                    setErrorMessage(null)
                  }}
                  disabled={isLoading}
                  className="w-full px-6 py-3 bg-gray-700 rounded-lg font-semibold text-white hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-lg bg-purple-800/50 border border-purple-500/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  placeholder="Enter 6-digit room code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-lg bg-purple-800/50 border border-purple-500/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-2xl font-bold tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {errorMessage && (
                  <div className="px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
                    {errorMessage}
                  </div>
                )}
                <button
                  onClick={handleJoinRoom}
                  disabled={isLoading}
                  className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-semibold text-white hover:from-blue-500 hover:to-purple-500 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isLoading ? 'Joining Room...' : 'Join Room'}
                </button>
                <button
                  onClick={() => {
                    setRoomAction(null)
                    setErrorMessage(null)
                  }}
                  disabled={isLoading}
                  className="w-full px-6 py-3 bg-gray-700 rounded-lg font-semibold text-white hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Room Info Bar */}
      {roomId && !showRoomModal && (
        <div className="room-actions-container fixed top-2 left-2 right-2 md:top-4 md:left-4 md:right-4 z-50 bg-black/70 backdrop-blur-sm rounded-lg border border-purple-500/30 shadow-2xl">
          {/* Mobile: Collapsible header */}
          <div className="flex items-center justify-between p-2 md:p-4">
            <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
              <div className="min-w-0">
                <div className="text-xs md:text-sm text-gray-400">Room Code</div>
                <div className="text-lg md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-500 truncate">
                  {roomCode}
                </div>
              </div>
              <div className="h-6 md:h-8 w-px bg-purple-500/50 hidden sm:block"></div>
              <div className="hidden sm:block">
                <div className="text-xs md:text-sm text-gray-400">Users</div>
                <div className="text-sm md:text-lg font-semibold text-white">
                  {roomUsers.length} {roomUsers.length === 1 ? 'person' : 'people'}
                </div>
              </div>
              {isHost && (
                <>
                  <div className="h-6 md:h-8 w-px bg-purple-500/50 hidden sm:block"></div>
                  <div className="px-2 md:px-3 py-1 bg-purple-600/50 rounded-full text-xs md:text-sm text-purple-200 hidden sm:block">
                    👑 Host
                  </div>
                </>
              )}
            </div>
            
            {/* Mobile: Menu button */}
            <button
              onClick={() => setShowRoomActionsMenu(!showRoomActionsMenu)}
              className="md:hidden p-2 hover:bg-purple-500/20 rounded-lg transition-colors"
              title="Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Desktop: Action buttons */}
            <div className="hidden md:flex items-center gap-2">
              {!callState?.isInCall ? (
                <>
                  <button
                    onClick={() => handleStartCall('audio')}
                    className="px-3 py-2 bg-green-600/50 hover:bg-green-600 rounded-lg text-white font-semibold transition-all flex items-center gap-2"
                    title="Start Audio Call"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span className="hidden lg:inline">Audio</span>
                  </button>
                  <button
                    onClick={() => handleStartCall('video')}
                    className="px-3 py-2 bg-blue-600/50 hover:bg-blue-600 rounded-lg text-white font-semibold transition-all flex items-center gap-2"
                    title="Start Video Call"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden lg:inline">Video</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowCallModal(true)}
                  className="px-3 py-2 bg-purple-600/50 hover:bg-purple-600 rounded-lg text-white font-semibold transition-all flex items-center gap-2"
                  title="Open Call"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="hidden lg:inline">In Call</span>
                </button>
              )}
              <button
                onClick={handleLeaveRoom}
                className="px-3 py-2 bg-red-600/50 hover:bg-red-600 rounded-lg text-white font-semibold transition-all"
                title="Leave Room"
              >
                <span className="hidden lg:inline">Leave</span>
                <span className="lg:hidden">Exit</span>
              </button>
            </div>
          </div>

          {/* Mobile: Collapsible menu */}
          {showRoomActionsMenu && (
            <div className="md:hidden border-t border-purple-500/30 p-2 space-y-2">
              {/* Mobile info row */}
              <div className="flex items-center justify-between text-xs text-gray-400 px-2 pb-2">
                <div>
                  Users: <span className="text-white font-semibold">{roomUsers.length}</span>
                </div>
                {isHost && (
                  <div className="px-2 py-1 bg-purple-600/50 rounded-full text-purple-200">
                    👑 Host
                  </div>
                )}
              </div>
              
              {/* Mobile action buttons */}
              <div className="grid grid-cols-2 gap-2">
                {!callState?.isInCall ? (
                  <>
                    <button
                      onClick={() => {
                        handleStartCall('audio')
                        setShowRoomActionsMenu(false)
                      }}
                      className="px-3 py-2.5 bg-green-600/50 hover:bg-green-600 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
                      title="Start Audio Call"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span>Audio</span>
                    </button>
                    <button
                      onClick={() => {
                        handleStartCall('video')
                        setShowRoomActionsMenu(false)
                      }}
                      className="px-3 py-2.5 bg-blue-600/50 hover:bg-blue-600 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
                      title="Start Video Call"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Video</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setShowCallModal(true)
                      setShowRoomActionsMenu(false)
                    }}
                    className="col-span-2 px-3 py-2.5 bg-purple-600/50 hover:bg-purple-600 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
                    title="Open Call"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>In Call - Open</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    handleLeaveRoom()
                    setShowRoomActionsMenu(false)
                  }}
                  className="col-span-2 px-3 py-2.5 bg-red-600/50 hover:bg-red-600 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
                  title="Leave Room"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Leave Room</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Call Modal */}
      {showCallModal && callState?.isInCall && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-4">
          <div className="w-full h-full md:max-w-6xl md:h-[90vh] md:rounded-lg bg-black/80 border border-purple-500/30 shadow-2xl flex flex-col overflow-hidden">
            {/* Call Header */}
            <div className="flex items-center justify-between p-2 md:p-4 border-b border-purple-500/30 flex-shrink-0">
              <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                <div className="w-2 h-2 md:w-3 md:h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0"></div>
                <h3 className="text-sm md:text-lg font-semibold text-white truncate">
                  <span className="hidden sm:inline">{callType === 'video' ? 'Video Call' : 'Audio Call'} - </span>
                  {roomUsers.length} {roomUsers.length === 1 ? 'participant' : 'participants'}
                </h3>
              </div>
              <button
                onClick={() => setShowCallModal(false)}
                className="p-2 hover:bg-purple-500/20 rounded-lg transition-colors flex-shrink-0"
                title="Minimize Call"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Video Grid */}
            <div className="flex-1 overflow-auto p-2 md:p-4 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 h-full">
                {/* Local Video */}
                {callType === 'video' && (
                  <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {!callState.isVideoEnabled && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                        <div className="text-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <p className="text-gray-400 text-sm">You (Camera Off)</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
                      You {!callState.isAudioEnabled && '🔇'}
                    </div>
                  </div>
                )}

                {/* Remote Videos - Works for both 1-to-1 and group calls */}
                {Array.from(remoteStreams.entries()).map(([userId, stream]) => {
                  const user = roomUsers.find(u => u.id === userId)
                  const hasAudio = stream.getAudioTracks().length > 0
                  const hasVideo = stream.getVideoTracks().length > 0
                  
                  return (
                    <div key={userId} className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
                      <video
                        ref={(el) => {
                          if (el) {
                            remoteVideoRefs.current.set(userId, el)
                            if (el.srcObject !== stream) {
                              el.srcObject = stream
                              // Ensure audio is not muted
                              el.muted = false
                              el.volume = 1.0
                              el.play().catch(err => {
                                console.warn(`Failed to play video for ${userId}:`, err)
                              })
                            }
                          } else {
                            remoteVideoRefs.current.delete(userId)
                          }
                        }}
                        autoPlay
                        playsInline
                        muted={false}
                        className="w-full h-full object-cover"
                      />
                      {!hasVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                          <div className="text-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <p className="text-gray-400 text-sm">{user?.name || 'Unknown'}</p>
                            {hasAudio && <p className="text-gray-500 text-xs mt-1">Audio only</p>}
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
                        {user?.name || 'Unknown'} {!hasAudio && '🔇'}
                      </div>
                    </div>
                  )
                })}

                {/* Empty state - Show connecting status when users are in room but streams not connected yet */}
                {/* Only show for audio calls OR video calls when no local video is shown */}
                {remoteStreams.size === 0 && (
                  <>
                    {/* Audio call - always show empty state when no streams */}
                    {callType === 'audio' && (
                      <div className="col-span-2 flex items-center justify-center h-full">
                        <div className="text-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-purple-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          <p className="text-gray-400 text-lg">Audio call in progress...</p>
                          {(() => {
                            const otherUsers = roomUsers.filter(u => u.id !== userId)
                            const connectedCount = Array.from(connectionStatuses.values()).filter(
                              s => s.status === 'connected'
                            ).length
                            const connectingCount = Array.from(connectionStatuses.values()).filter(
                              s => s.status === 'connecting'
                            ).length
                            const hasConnected = connectedCount > 0
                            
                            if (hasConnected) {
                              return (
                                <div className="mt-2">
                                  <div className="inline-block w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-2 mx-auto">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                  <p className="text-green-400 text-sm font-semibold">✅ Connected!</p>
                                  <p className="text-gray-400 text-xs mt-1">
                                    {connectedCount} of {otherUsers.length} connected
                                  </p>
                                  {connectingCount > 0 && (
                                    <p className="text-gray-500 text-xs mt-1">Connecting to {connectingCount} more...</p>
                                  )}
                                </div>
                              )
                            } else if (roomUsers.length > 1) {
                              return (
                                <div className="mt-2">
                                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400 mb-2"></div>
                                  <p className="text-gray-500 text-sm">
                                    Connecting to {roomUsers.length - 1} {roomUsers.length === 2 ? 'participant' : 'participants'}...
                                  </p>
                                  <p className="text-gray-600 text-xs mt-1">This may take a few seconds</p>
                                </div>
                              )
                            } else {
                              return <p className="text-gray-500 text-sm mt-2">Waiting for other participants to join</p>
                            }
                          })()}
                        </div>
                      </div>
                    )}
                    
                    {/* Video call - only show empty state if no local video visible (so it doesn't overlap) */}
                    {callType === 'video' && !callState?.localStream && (
                      <div className="col-span-2 flex items-center justify-center h-full">
                        <div className="text-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-purple-400 mx-auto mb-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <p className="text-gray-400 text-lg">Video call in progress...</p>
                          {(() => {
                            const otherUsers = roomUsers.filter(u => u.id !== userId)
                            const connectedCount = Array.from(connectionStatuses.values()).filter(
                              s => s.status === 'connected'
                            ).length
                            const connectingCount = Array.from(connectionStatuses.values()).filter(
                              s => s.status === 'connecting'
                            ).length
                            const hasConnected = connectedCount > 0
                            
                            if (hasConnected) {
                              return (
                                <div className="mt-2">
                                  <div className="inline-block w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-2 mx-auto">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                  <p className="text-green-400 text-sm font-semibold">✅ Connected!</p>
                                  <p className="text-gray-400 text-xs mt-1">
                                    {connectedCount} of {otherUsers.length} connected
                                  </p>
                                  {connectingCount > 0 && (
                                    <p className="text-gray-500 text-xs mt-1">Connecting to {connectingCount} more...</p>
                                  )}
                                </div>
                              )
                            } else if (roomUsers.length > 1) {
                              return (
                                <div className="mt-2">
                                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400 mb-2"></div>
                                  <p className="text-gray-500 text-sm">
                                    Connecting to {roomUsers.length - 1} {roomUsers.length === 2 ? 'participant' : 'participants'}...
                                  </p>
                                  <p className="text-gray-600 text-xs mt-1">This may take a few seconds</p>
                                </div>
                              )
                            } else {
                              return <p className="text-gray-500 text-sm mt-2">Waiting for other participants to join</p>
                            }
                          })()}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Call Controls */}
            <div className="p-2 md:p-4 border-t border-purple-500/30 flex items-center justify-center gap-2 md:gap-4 flex-shrink-0">
              {callType === 'video' && (
                <button
                  onClick={handleToggleVideo}
                  className={`p-2.5 md:p-3 rounded-full transition-all ${
                    callState.isVideoEnabled
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                  title={callState.isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {callState.isVideoEnabled ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    )}
                  </svg>
                </button>
              )}
              <button
                onClick={handleToggleAudio}
                className={`p-2.5 md:p-3 rounded-full transition-all ${
                  callState.isAudioEnabled
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
                title={callState.isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {callState.isAudioEnabled ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  )}
                </svg>
              </button>
              <button
                onClick={handleEndCall}
                className="p-2.5 md:p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all"
                title="End call"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Standalone Mode Leave Button */}
      {!roomId && !showRoomModal && (
        <button
          onClick={() => setShowRoomModal(true)}
          className="fixed top-4 right-4 z-50 w-12 h-12 rounded-full bg-red-600/50 hover:bg-red-600 border border-red-500/50 hover:border-red-400 transition-colors cursor-pointer flex items-center justify-center shadow-lg"
          title="Leave Countdown Alone"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
      
      {/* Chat Panel (bottom left) */}
      {roomId && !showRoomModal && (
        <div className="fixed bottom-4 left-4 z-50 w-80 bg-black/80 backdrop-blur-sm rounded-lg border border-purple-500/30 shadow-2xl flex flex-col max-h-96 overflow-hidden">
          {/* Chat Header */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="w-full flex items-center justify-between p-3 border-b border-purple-500/30 hover:bg-purple-500/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <h3 className="text-sm font-semibold text-white">Room Chat</h3>
            </div>
            <span className="text-gray-400 hover:text-white transition-colors text-sm">
              {showChat ? '▼' : '▲'}
            </span>
          </button>
          
          {/* Chat Messages */}
          {showChat && (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0" style={{ maxHeight: '240px' }}>
                {chatMessages.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-4">
                    No messages yet. Start chatting! 💬
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          msg.userId === userId ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div className="text-xs text-gray-400 mb-1">
                          {msg.userId === userId ? 'You' : msg.userName}
                          {msg.userId === userId && isHost && ' 👑'}
                        </div>
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm break-words ${
                            msg.userId === userId
                              ? 'bg-purple-600/70 text-white'
                              : 'bg-purple-800/50 text-gray-200'
                          }`}
                        >
                          {msg.message}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))}
                    {/* Invisible element at the end to scroll to */}
                    <div ref={chatMessagesEndRef} />
                  </>
                )}
              </div>
              
              {/* Chat Input */}
              <div className="p-3 border-t border-purple-500/30 relative emoji-picker-container flex-shrink-0">
                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 mb-2 bg-black/90 backdrop-blur-sm rounded-lg border border-purple-500/50 p-3 w-full max-h-48 overflow-y-auto shadow-2xl z-10">
                    <div className="grid grid-cols-8 gap-2">
                      {commonEmojis.map((emoji, index) => (
                        <button
                          key={index}
                          onClick={() => handleEmojiClick(emoji)}
                          className="text-2xl hover:bg-purple-600/50 rounded p-1 transition-colors cursor-pointer"
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="flex-shrink-0 px-2.5 py-2 bg-purple-700/50 hover:bg-purple-600/50 rounded-lg text-lg transition-colors"
                    title="Add emoji"
                  >
                    😀
                  </button>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    onFocus={() => setShowEmojiPicker(false)}
                    placeholder="Type a message..."
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-purple-800/50 border border-purple-500/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim()}
                    className="flex-shrink-0 px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold text-white hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      
      {/* Users List (floating) */}
      {roomId && !showRoomModal && roomUsers.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50">
          {showUsersList ? (
            <div className="bg-black/70 backdrop-blur-sm rounded-lg border border-purple-500/30 max-w-xs overflow-hidden">
              <button
                onClick={() => setShowUsersList(false)}
                className="w-full flex items-center justify-between p-3 border-b border-purple-500/30 hover:bg-purple-500/10 transition-colors cursor-pointer"
              >
                <div className="text-sm font-semibold text-gray-300">People in Room:</div>
                <span className="text-gray-400 hover:text-white transition-colors text-sm">
                  ▼
                </span>
              </button>
              <div className="p-4">
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {roomUsers.map((user) => (
                    <div
                      key={user.id}
                      className={`flex items-center justify-between text-sm py-1 px-2 rounded ${
                        user.id === userId
                          ? 'bg-purple-600/50 text-purple-200'
                          : 'text-gray-300'
                      }`}
                    >
                      <span>
                        {user.name} {user.id === userId && '(You)'}
                        {isHost && user.id === userId && ' 👑'}
                      </span>
                      {isHost && user.id !== userId && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (roomId && userId) {
                              try {
                                await kickUser(roomId, user.id, userId)
                              } catch (error) {
                                console.error('Failed to kick user:', error)
                                setErrorMessage(error instanceof Error ? error.message : 'Failed to kick user')
                              }
                            }
                          }}
                          className="ml-2 text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/20 transition-colors"
                          title="Kick user"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowUsersList(true)}
              className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-sm border border-purple-500/30 hover:bg-purple-500/20 transition-colors cursor-pointer flex items-center justify-center shadow-lg"
              title="Show People in Room"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </button>
          )}
        </div>
      )}
      {/* Glowing orbs background - more intense during last minute */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute top-20 left-10 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-blob ${
          lastMinute ? 'opacity-40 animate-pulse-intense' : 'opacity-20'
        }`}></div>
        <div className={`absolute top-40 right-10 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000 ${
          lastMinute ? 'opacity-40 animate-pulse-intense' : 'opacity-20'
        }`}></div>
        <div className={`absolute -bottom-8 left-1/2 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000 ${
          lastMinute ? 'opacity-40 animate-pulse-intense' : 'opacity-20'
        }`}></div>
        {/* Extra orb during last minute */}
        {lastMinute && (
          <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-orange-500 rounded-full mix-blend-multiply filter blur-2xl opacity-30 animate-blob animation-delay-1000"></div>
        )}
      </div>

      {/* Floating stars background */}
      <div className="absolute inset-0">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${Math.random() * 2 + 1}s`,
            }}
          />
        ))}
      </div>

      {/* Floating decorative emojis/icons - appears after New Year */}
      {showDecorations && (
        <div className="absolute inset-0 pointer-events-none z-15">
          {['🎈', '⭐', '✨', '🎊', '🎁', '💫', '🌟', '🎉'].map((emoji, i) => (
            <div
              key={i}
              className="absolute text-4xl md:text-6xl animate-float"
              style={{
                left: `${10 + (i * 12)}%`,
                top: `${20 + (i % 3) * 30}%`,
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${3 + (i % 3)}s`,
              }}
            >
              {emoji}
            </div>
          ))}
        </div>
      )}

      {/* Sparkle effects around countdown - more intense during last minute */}
      {!isNewYear && (
        <div className="absolute inset-0 pointer-events-none z-5">
          {Array.from({ length: lastMinute ? 20 : 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-sparkle"
              style={{
                left: `${10 + (i * (90 / (lastMinute ? 20 : 8)))}%`,
                top: `${20 + (i % 3) * 25}%`,
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${1.5 + (i % 2)}s`,
              }}
            >
              <svg 
                width={lastMinute ? "30" : "20"} 
                height={lastMinute ? "30" : "20"} 
                viewBox="0 0 20 20" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path 
                  d="M10 0L12 7L19 10L12 13L10 20L8 13L1 10L8 7L10 0Z" 
                  fill="currentColor" 
                  className={lastMinute ? "text-yellow-300 opacity-100" : "text-yellow-300 opacity-80"} 
                />
              </svg>
            </div>
          ))}
        </div>
      )}

      {/* Confetti canvas */}
      {showConfetti && (
        <canvas
          ref={confettiCanvasRef}
          className="absolute inset-0 pointer-events-none z-20"
        />
      )}

      {/* Big firework rocket canvas (last 10 seconds and explosion) */}
      {(last10Seconds || show2026Explosion) && (
        <canvas
          ref={bigFireworkCanvasRef}
          className="absolute inset-0 pointer-events-none z-25"
        />
      )}

      {/* Fireworks canvas */}
      {showFireworks && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-30"
        />
      )}

      {/* Main content */}
      <div className="relative z-40 text-center px-4 animate-fade-in">
        {isNewYear ? (
          <div className="space-y-8">
            {/* Main celebration message - staged reveal */}
            {showMessage && (
              <div className="space-y-6 animate-scale-in">
                <h1 
                  onClick={handleEasterEgg}
                  className={`text-6xl md:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 animate-pulse cursor-pointer transition-transform duration-300 ${
                    easterEggActive ? 'scale-110' : 'hover:scale-105'
                  }`}
                  title="Click for a surprise! 🎁"
                >
                  🎉 Happy New Year 2026! 🎉
                </h1>
                
                {/* Random surprise message - appears later */}
                {randomMessage && (
                  <p className="text-xl md:text-3xl text-white font-light animate-fade-in-delayed">
                    {randomMessage}
                  </p>
                )}
                
                {/* Easter egg hint */}
                {showMessage && !easterEggActive && (
                  <p className="text-sm md:text-base text-gray-400 font-light animate-pulse">
                    💡 Click the year for a special surprise!
                  </p>
                )}
                
                {/* Easter egg active message */}
                {easterEggActive && (
                  <p className="text-xl md:text-2xl text-yellow-300 font-bold animate-bounce">
                    🎁 Secret Celebration Unlocked! 🎁
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {last10Seconds ? (
              // Big number countdown (last 10 seconds)
              <div className="space-y-8">
                <div className="relative">
                  <div className="text-[200px] md:text-[300px] lg:text-[400px] font-bold text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-pink-400 to-purple-400 drop-shadow-2xl animate-pulse">
                    {bigCountdownNumber}
                  </div>
                  {/* Glow effect around number */}
                  <div className="absolute inset-0 text-[200px] md:text-[300px] lg:text-[400px] font-bold text-yellow-300/30 blur-2xl -z-10">
                    {bigCountdownNumber}
                  </div>
                </div>
                <p className="text-2xl md:text-4xl text-white font-light animate-pulse">
                  Get Ready! 🚀
                </p>
              </div>
            ) : lastMinute ? (
              // Last minute special display - intense pulsing and anticipation
              <div className="space-y-8">
                <div className="relative">
                  {/* "Final Minute!" indicator */}
                  <div className="mb-6">
                    <p className="text-3xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 animate-heartbeat">
                      ⏰ Final Minute! ⏰
                    </p>
                  </div>
                  
                  {/* Enhanced countdown with intense pulsing */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 relative">
                    {/* More intense glowing effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/40 via-pink-500/40 to-purple-500/40 blur-3xl rounded-full -z-10 animate-pulse-intense"></div>
                    <TimeUnit label="Days" value={timeLeft.days} intense={true} />
                    <TimeUnit label="Hours" value={timeLeft.hours} intense={true} />
                    <TimeUnit label="Minutes" value={timeLeft.minutes} intense={true} />
                    <TimeUnit label="Seconds" value={timeLeft.seconds} intense={true} />
                  </div>
                  
                  {/* Anticipation message */}
                  <p className="text-xl md:text-3xl text-white font-light animate-pulse mt-6">
                    The moment is almost here... 🌟
                  </p>
                </div>
              </div>
            ) : (
              // Normal countdown display
              <>
                <div className="relative">
                  {/* Decorative elements around title */}
                  <div className="absolute -left-8 -top-4 text-3xl animate-bounce" style={{ animationDelay: '0.5s' }}>
                    🎆
                  </div>
                  <div className="absolute -right-8 -top-4 text-3xl animate-bounce" style={{ animationDelay: '1s' }}>
                    🎇
                  </div>
                  <h1 className="text-4xl md:text-6xl font-bold text-white mb-12 relative">
                    Welcome to 2026
                  </h1>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 relative">
                  {/* Glowing effect behind countdown */}
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 via-pink-500/20 to-purple-500/20 blur-3xl rounded-full -z-10"></div>
                  <TimeUnit label="Days" value={timeLeft.days} />
                  <TimeUnit label="Hours" value={timeLeft.hours} />
                  <TimeUnit label="Minutes" value={timeLeft.minutes} />
                  <TimeUnit label="Seconds" value={timeLeft.seconds} />
                </div>
                {/* Hint before new year */}
                {timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes < 1 && !last10Seconds && !lastMinute && (
                  <div className="relative">
                    <p className="text-sm text-gray-400 mt-4 animate-pulse">
                      Get ready for something amazing... ✨
                    </p>
                    {/* Animated sparkles around hint */}
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-2">
                      <span className="text-yellow-300 text-xl animate-ping">✨</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes fade-in-delayed {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scale-in {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
            opacity: 0.7;
          }
          50% {
            transform: translateY(-20px) rotate(10deg);
            opacity: 1;
          }
        }

        @keyframes sparkle {
          0%, 100% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1) rotate(180deg);
          }
        }

        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }

        @keyframes heartbeat {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          25% {
            transform: scale(1.05);
            filter: brightness(1.3);
          }
          50% {
            transform: scale(1.1);
            filter: brightness(1.5);
          }
          75% {
            transform: scale(1.05);
            filter: brightness(1.3);
          }
        }

        @keyframes pulse-intense {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.2);
          }
        }

        .animate-fade-in {
          animation: fade-in 1s ease-in;
        }

        .animate-fade-in-delayed {
          animation: fade-in-delayed 1s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.8s ease-out;
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .animate-sparkle {
          animation: sparkle 2s ease-in-out infinite;
        }

        .animate-blob {
          animation: blob 7s ease-in-out infinite;
        }

        .animate-heartbeat {
          animation: heartbeat 1s ease-in-out infinite;
        }

        .animate-pulse-intense {
          animation: pulse-intense 1.5s ease-in-out infinite;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  )
}

function TimeUnit({ label, value, intense = false }: { label: string; value: number; intense?: boolean }) {
  return (
    <div className="flex flex-col items-center space-y-2">
      <div className={`text-5xl md:text-7xl lg:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-pink-400 to-purple-400 drop-shadow-lg ${
        intense ? 'animate-heartbeat' : ''
      }`}>
        {String(value).padStart(2, '0')}
      </div>
      <div className={`text-lg md:text-xl uppercase tracking-wider ${
        intense ? 'text-yellow-300 font-semibold' : 'text-gray-300'
      }`}>
        {label}
      </div>
    </div>
  )
}


