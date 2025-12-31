import { ref, set, onValue, off, remove, get } from 'firebase/database'
import { database } from './firebase'

export interface CallOffer {
  type: 'offer'
  sdp: RTCSessionDescriptionInit
  fromUserId: string
  fromUserName: string
  timestamp: number
}

export interface CallAnswer {
  type: 'answer'
  sdp: RTCSessionDescriptionInit
  fromUserId: string
  timestamp: number
}

export interface ICECandidate {
  type: 'ice-candidate'
  candidate: RTCIceCandidateInit
  fromUserId: string
  timestamp: number
}

export type SignalingMessage = CallOffer | CallAnswer | ICECandidate

export interface CallState {
  isInCall: boolean
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  peerConnections: Map<string, RTCPeerConnection>
}

export class WebRTCManager {
  private roomId: string
  private userId: string
  private callState: CallState
  private signalingUnsubscribers: Map<string, () => void> = new Map()
  private onStateChangeCallback?: (state: CallState) => void
  private onRemoteStreamCallback?: (userId: string, stream: MediaStream) => void
  private onRemoteStreamRemovedCallback?: (userId: string) => void

  constructor(roomId: string, userId: string) {
    this.roomId = roomId
    this.userId = userId
    this.callState = {
      isInCall: false,
      isVideoEnabled: false,
      isAudioEnabled: false,
      localStream: null,
      remoteStreams: new Map(),
      peerConnections: new Map(),
    }
  }

  // Set callbacks
  onStateChange(callback: (state: CallState) => void) {
    this.onStateChangeCallback = callback
  }

  onRemoteStream(callback: (userId: string, stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback
  }

  onRemoteStreamRemoved(callback: (userId: string) => void) {
    this.onRemoteStreamRemovedCallback = callback
  }

  private notifyStateChange() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({ ...this.callState })
    }
  }

  // Start a call (audio or video)
  async startCall(videoEnabled: boolean = true, audioEnabled: boolean = true): Promise<void> {
    try {
      // Get user media
      const constraints: MediaStreamConstraints = {
        video: videoEnabled ? { facingMode: 'user' } : false,
        audio: audioEnabled,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.callState.localStream = stream
      this.callState.isVideoEnabled = videoEnabled
      this.callState.isAudioEnabled = audioEnabled
      this.callState.isInCall = true
      this.notifyStateChange()

      // Set up signaling listeners for all users in the room
      await this.setupSignaling()

      // Create peer connections for existing users
      const usersRef = ref(database, `rooms/${this.roomId}/users`)
      const usersSnapshot = await get(usersRef)
      const users = usersSnapshot.val()

      if (users) {
        for (const [otherUserId, _] of Object.entries(users)) {
          if (otherUserId !== this.userId) {
            await this.createPeerConnection(otherUserId as string)
          }
        }
      }
    } catch (error) {
      console.error('Error starting call:', error)
      throw error
    }
  }

  // End the call
  async endCall(): Promise<void> {
    // Stop local stream
    if (this.callState.localStream) {
      this.callState.localStream.getTracks().forEach(track => track.stop())
      this.callState.localStream = null
    }

    // Close all peer connections
    this.callState.peerConnections.forEach((pc, userId) => {
      pc.close()
    })
    this.callState.peerConnections.clear()

    // Clear remote streams
    this.callState.remoteStreams.clear()

    // Unsubscribe from signaling
    this.signalingUnsubscribers.forEach(unsubscribe => unsubscribe())
    this.signalingUnsubscribers.clear()

    // Clear signaling data
    const signalingRef = ref(database, `rooms/${this.roomId}/signaling/${this.userId}`)
    await remove(signalingRef)

    this.callState.isInCall = false
    this.callState.isVideoEnabled = false
    this.callState.isAudioEnabled = false
    this.notifyStateChange()
  }

  // Toggle video
  toggleVideo(): void {
    if (!this.callState.localStream) return

    const videoTrack = this.callState.localStream.getVideoTracks()[0]
    if (videoTrack) {
      this.callState.isVideoEnabled = !this.callState.isVideoEnabled
      videoTrack.enabled = this.callState.isVideoEnabled
      this.notifyStateChange()
    }
  }

  // Toggle audio
  toggleAudio(): void {
    if (!this.callState.localStream) return

    const audioTrack = this.callState.localStream.getAudioTracks()[0]
    if (audioTrack) {
      this.callState.isAudioEnabled = !this.callState.isAudioEnabled
      audioTrack.enabled = this.callState.isAudioEnabled
      this.notifyStateChange()
    }
  }

  // Get current call state
  getCallState(): CallState {
    return { ...this.callState }
  }

  // Create peer connection with another user
  private async createPeerConnection(otherUserId: string): Promise<void> {
    if (this.callState.peerConnections.has(otherUserId)) {
      return // Already connected
    }

    // Don't create connection if not in a call
    if (!this.callState.isInCall || !this.callState.localStream) {
      return
    }

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    }

    const peerConnection = new RTCPeerConnection(configuration)

    // Add local stream tracks
    if (this.callState.localStream) {
      this.callState.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.callState.localStream!)
      })
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (remoteStream) {
        this.callState.remoteStreams.set(otherUserId, remoteStream)
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(otherUserId, remoteStream)
        }
        this.notifyStateChange()
      }
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendICECandidate(otherUserId, event.candidate)
      }
    }

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'disconnected' || 
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed') {
        this.callState.remoteStreams.delete(otherUserId)
        if (this.onRemoteStreamRemovedCallback) {
          this.onRemoteStreamRemovedCallback(otherUserId)
        }
        this.notifyStateChange()
      }
    }

    this.callState.peerConnections.set(otherUserId, peerConnection)

    // Create and send offer only if we have a local stream
    if (this.callState.localStream) {
      try {
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        await this.sendOffer(otherUserId, offer)
      } catch (error) {
        console.error('Error creating offer:', error)
      }
    }
  }

  // Set up signaling listeners
  private async setupSignaling(): Promise<void> {
    // Listen for new users joining
    const usersRef = ref(database, `rooms/${this.roomId}/users`)
    const unsubscribeUsers = onValue(usersRef, async (snapshot) => {
      const users = snapshot.val()
      if (users) {
        for (const [otherUserId, _] of Object.entries(users)) {
          if (otherUserId !== this.userId && 
              !this.callState.peerConnections.has(otherUserId as string)) {
            await this.createPeerConnection(otherUserId as string)
          }
        }
      }
    })
    this.signalingUnsubscribers.set('users', unsubscribeUsers)

    // Listen for signaling messages
    const signalingRef = ref(database, `rooms/${this.roomId}/signaling`)
    const unsubscribeSignaling = onValue(signalingRef, (snapshot) => {
      const signaling = snapshot.val()
      if (!signaling) return

      for (const [fromUserId, messages] of Object.entries(signaling)) {
        if (fromUserId === this.userId) continue

        const messagesObj = messages as Record<string, SignalingMessage>
        if (!messagesObj) continue

        for (const [messageId, message] of Object.entries(messagesObj)) {
          this.handleSignalingMessage(fromUserId, message as SignalingMessage)
          
          // Clean up processed message
          const messageRef = ref(database, `rooms/${this.roomId}/signaling/${fromUserId}/${messageId}`)
          remove(messageRef).catch(console.error)
        }
      }
    })
    this.signalingUnsubscribers.set('signaling', unsubscribeSignaling)
  }

  // Handle incoming signaling messages
  private async handleSignalingMessage(fromUserId: string, message: SignalingMessage): Promise<void> {
    // Only handle messages if we're in a call
    if (!this.callState.isInCall) return

    let peerConnection = this.callState.peerConnections.get(fromUserId)

    if (message.type === 'offer') {
      if (!peerConnection) {
        // Create peer connection if it doesn't exist
        await this.createPeerConnection(fromUserId)
        peerConnection = this.callState.peerConnections.get(fromUserId)
      }

      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
          const answer = await peerConnection.createAnswer()
          await peerConnection.setLocalDescription(answer)
          await this.sendAnswer(fromUserId, answer)
        } catch (error) {
          console.error('Error handling offer:', error)
        }
      }
    } else if (message.type === 'answer') {
      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
        } catch (error) {
          console.error('Error handling answer:', error)
        }
      }
    } else if (message.type === 'ice-candidate') {
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
        } catch (error) {
          console.error('Error adding ICE candidate:', error)
        }
      }
    }
  }

  // Send offer
  private async sendOffer(toUserId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const messageRef = ref(database, `rooms/${this.roomId}/signaling/${this.userId}`)
    const messageId = `offer_${Date.now()}`
    
    const userName = await this.getUserName()
    
    await set(ref(database, `rooms/${this.roomId}/signaling/${this.userId}/${messageId}`), {
      type: 'offer',
      sdp: offer,
      fromUserId: this.userId,
      fromUserName: userName,
      timestamp: Date.now(),
    } as CallOffer)
  }

  // Send answer
  private async sendAnswer(toUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const messageRef = ref(database, `rooms/${this.roomId}/signaling/${this.userId}`)
    const messageId = `answer_${Date.now()}`
    
    await set(ref(database, `rooms/${this.roomId}/signaling/${this.userId}/${messageId}`), {
      type: 'answer',
      sdp: answer,
      fromUserId: this.userId,
      timestamp: Date.now(),
    } as CallAnswer)
  }

  // Send ICE candidate
  private async sendICECandidate(toUserId: string, candidate: RTCIceCandidate): Promise<void> {
    const messageRef = ref(database, `rooms/${this.roomId}/signaling/${this.userId}`)
    const messageId = `ice_${Date.now()}`
    
    await set(ref(database, `rooms/${this.roomId}/signaling/${this.userId}/${messageId}`), {
      type: 'ice-candidate',
      candidate: candidate.toJSON(),
      fromUserId: this.userId,
      timestamp: Date.now(),
    } as ICECandidate)
  }

  // Get user name from Firebase
  private async getUserName(): Promise<string> {
    try {
      const userRef = ref(database, `rooms/${this.roomId}/users/${this.userId}`)
      const userSnapshot = await get(userRef)
      const userData = userSnapshot.val()
      return userData?.name || 'Unknown'
    } catch (error) {
      return 'Unknown'
    }
  }

  // Cleanup
  destroy(): void {
    this.endCall().catch(console.error)
  }
}

