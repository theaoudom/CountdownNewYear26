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
  private processedMessages: Set<string> = new Set()
  private iceCandidateQueue: Map<string, RTCIceCandidateInit[]> = new Map()

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
            // Determine who should be the initiator (lower user ID creates offer)
            const isInitiator = this.userId < (otherUserId as string)
            await this.createPeerConnection(otherUserId as string, isInitiator)
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

    // Clear processed messages and ICE candidate queue
    this.processedMessages.clear()
    this.iceCandidateQueue.clear()

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
  private async createPeerConnection(otherUserId: string, isInitiator: boolean = true): Promise<void> {
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
        console.log(`Received remote stream from ${otherUserId}`)
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
        console.log(`Sending ICE candidate to ${otherUserId}`)
        this.sendICECandidate(otherUserId, event.candidate)
      } else {
        console.log(`ICE gathering complete for ${otherUserId}`)
      }
    }

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${otherUserId}:`, peerConnection.iceConnectionState)
      if (peerConnection.iceConnectionState === 'failed') {
        // Try to restart ICE
        peerConnection.restartIce()
      }
    }

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for ${otherUserId}:`, peerConnection.connectionState)
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

    // Process queued ICE candidates
    const queuedCandidates = this.iceCandidateQueue.get(otherUserId)
    if (queuedCandidates && queuedCandidates.length > 0) {
      for (const candidate of queuedCandidates) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (error) {
          console.error('Error adding queued ICE candidate:', error)
        }
      }
      this.iceCandidateQueue.delete(otherUserId)
    }

    // Create and send offer only if we're the initiator and have a local stream
    if (isInitiator && this.callState.localStream) {
      try {
        console.log(`Creating offer for ${otherUserId}`)
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: this.callState.isVideoEnabled,
        })
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
            // Determine who should be the initiator (lower user ID creates offer)
            const isInitiator = this.userId < (otherUserId as string)
            await this.createPeerConnection(otherUserId as string, isInitiator)
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
          // Process message asynchronously
          this.handleSignalingMessage(fromUserId, message as SignalingMessage, messageId).then(() => {
            // Clean up processed message after a delay to ensure it's been processed
            setTimeout(() => {
              const messageRef = ref(database, `rooms/${this.roomId}/signaling/${fromUserId}/${messageId}`)
              remove(messageRef).catch(console.error)
            }, 1000)
          }).catch(console.error)
        }
      }
    })
    this.signalingUnsubscribers.set('signaling', unsubscribeSignaling)
  }

  // Handle incoming signaling messages
  private async handleSignalingMessage(fromUserId: string, message: SignalingMessage, messageId: string): Promise<void> {
    // Only handle messages if we're in a call
    if (!this.callState.isInCall) return

    // Skip if already processed
    const messageKey = `${fromUserId}_${messageId}`
    if (this.processedMessages.has(messageKey)) {
      return
    }
    this.processedMessages.add(messageKey)

    let peerConnection = this.callState.peerConnections.get(fromUserId)

    if (message.type === 'offer') {
      console.log(`Received offer from ${fromUserId}`)
      if (!peerConnection) {
        // Create peer connection as responder (not initiator)
        await this.createPeerConnection(fromUserId, false)
        peerConnection = this.callState.peerConnections.get(fromUserId)
      }

      if (peerConnection) {
        try {
          // Set remote description first
          await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
          console.log(`Set remote description from ${fromUserId}`)
          
          // Process any queued ICE candidates
          const queuedCandidates = this.iceCandidateQueue.get(fromUserId)
          if (queuedCandidates && queuedCandidates.length > 0) {
            for (const candidate of queuedCandidates) {
              try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
              } catch (error) {
                console.error('Error adding queued ICE candidate:', error)
              }
            }
            this.iceCandidateQueue.delete(fromUserId)
          }
          
          // Create and send answer
          const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: this.callState.isVideoEnabled,
          })
          await peerConnection.setLocalDescription(answer)
          console.log(`Sending answer to ${fromUserId}`)
          await this.sendAnswer(fromUserId, answer)
        } catch (error) {
          console.error('Error handling offer:', error)
        }
      }
    } else if (message.type === 'answer') {
      console.log(`Received answer from ${fromUserId}`)
      if (peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
          console.log(`Set remote description (answer) from ${fromUserId}`)
          
          // Process any queued ICE candidates
          const queuedCandidates = this.iceCandidateQueue.get(fromUserId)
          if (queuedCandidates && queuedCandidates.length > 0) {
            for (const candidate of queuedCandidates) {
              try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
              } catch (error) {
                console.error('Error adding queued ICE candidate:', error)
              }
            }
            this.iceCandidateQueue.delete(fromUserId)
          }
        } catch (error) {
          console.error('Error handling answer:', error)
        }
      }
    } else if (message.type === 'ice-candidate') {
      console.log(`Received ICE candidate from ${fromUserId}`)
      if (peerConnection) {
        // Check if remote description is set
        if (peerConnection.remoteDescription) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
            console.log(`Added ICE candidate from ${fromUserId}`)
          } catch (error) {
            console.error('Error adding ICE candidate:', error)
          }
        } else {
          // Queue ICE candidate until remote description is set
          console.log(`Queueing ICE candidate from ${fromUserId} (waiting for remote description)`)
          if (!this.iceCandidateQueue.has(fromUserId)) {
            this.iceCandidateQueue.set(fromUserId, [])
          }
          this.iceCandidateQueue.get(fromUserId)!.push(message.candidate)
        }
      } else {
        // Queue ICE candidate if peer connection doesn't exist yet
        console.log(`Queueing ICE candidate from ${fromUserId} (peer connection not ready)`)
        if (!this.iceCandidateQueue.has(fromUserId)) {
          this.iceCandidateQueue.set(fromUserId, [])
        }
        this.iceCandidateQueue.get(fromUserId)!.push(message.candidate)
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

