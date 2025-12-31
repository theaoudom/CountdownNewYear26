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

export interface ConnectionStatus {
  userId: string
  status: 'connecting' | 'connected' | 'disconnected' | 'failed'
  iceConnectionState: string
  connectionState: string
}

export interface CallState {
  isInCall: boolean
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  peerConnections: Map<string, RTCPeerConnection>
  connectionStatuses: Map<string, ConnectionStatus>
}

export class WebRTCManager {
  private roomId: string
  private userId: string
  private callState: CallState
  private signalingUnsubscribers: Map<string, () => void> = new Map()
  private onStateChangeCallback?: (state: CallState) => void
  private onRemoteStreamCallback?: (userId: string, stream: MediaStream) => void
  private onRemoteStreamRemovedCallback?: (userId: string) => void
  private onConnectionStatusChangeCallback?: (userId: string, status: ConnectionStatus) => void
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
      connectionStatuses: new Map(),
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

  onConnectionStatusChange(callback: (userId: string, status: ConnectionStatus) => void) {
    this.onConnectionStatusChangeCallback = callback
  }

  private notifyStateChange() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({ ...this.callState })
    }
  }

  // Start a call (audio or video)
  async startCall(videoEnabled: boolean = true, audioEnabled: boolean = true): Promise<void> {
    try {
      // Enhanced media constraints for better mobile support
      const constraints: MediaStreamConstraints = {
        video: videoEnabled ? {
          facingMode: 'user',
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          // Mobile-specific optimizations
          aspectRatio: 16 / 9,
        } : false,
        audio: audioEnabled ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Better audio quality
          sampleRate: 48000,
          channelCount: 1,
        } : false,
      }

      console.log('Requesting user media with constraints:', constraints)
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      // Log stream info
      stream.getTracks().forEach(track => {
        console.log(`Track: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`)
        if (track.kind === 'video') {
          const settings = track.getSettings()
          console.log('Video settings:', settings)
        }
      })
      
      this.callState.localStream = stream
      this.callState.isVideoEnabled = videoEnabled
      this.callState.isAudioEnabled = audioEnabled
      this.callState.isInCall = true
      this.notifyStateChange()

      // Set up signaling listeners for all users in the room
      await this.setupSignaling()

      // Create peer connections for existing users (for group calls)
      const usersRef = ref(database, `rooms/${this.roomId}/users`)
      const usersSnapshot = await get(usersRef)
      const users = usersSnapshot.val()

      if (users) {
        const userEntries = Object.entries(users)
        console.log(`Creating peer connections for ${userEntries.length - 1} other users`)
        
        // Create connections to all other users (mesh network for group calls)
        for (const [otherUserId, _] of userEntries) {
          if (otherUserId !== this.userId) {
            // Determine who should be the initiator (lower user ID creates offer)
            // This prevents both users from creating offers simultaneously
            const isInitiator = this.userId < (otherUserId as string)
            console.log(`Creating connection to ${otherUserId}, isInitiator: ${isInitiator}`)
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

    // Enhanced ICE servers configuration with TURN servers for better mobile/NAT traversal
    const configuration: RTCConfiguration = {
      iceServers: [
        // STUN servers for NAT discovery
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Public TURN servers (free but may have limitations)
        // Note: For production, consider using a paid TURN service like Twilio, Xirsys, or Metered
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        // Additional free TURN servers
        {
          urls: 'turn:relay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:relay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
      iceCandidatePoolSize: 10, // Pre-gather ICE candidates for faster connection
    }

    const peerConnection = new RTCPeerConnection(configuration)

    // Add local stream tracks
    if (this.callState.localStream) {
      this.callState.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.callState.localStream!)
      })
    }

    // Handle remote stream (works for both 1-to-1 and group calls)
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (remoteStream) {
        console.log(`Received remote stream from ${otherUserId}`, {
          audioTracks: remoteStream.getAudioTracks().length,
          videoTracks: remoteStream.getVideoTracks().length,
        })
        
        // Log track details for debugging
        remoteStream.getAudioTracks().forEach(track => {
          console.log(`Audio track from ${otherUserId}:`, {
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted,
          })
        })
        
        remoteStream.getVideoTracks().forEach(track => {
          console.log(`Video track from ${otherUserId}:`, {
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted,
          })
        })
        
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

    // Update connection status
    const updateConnectionStatus = () => {
      const iceState = peerConnection.iceConnectionState
      const connState = peerConnection.connectionState
      
      let status: ConnectionStatus['status'] = 'connecting'
      if (iceState === 'connected' || iceState === 'completed') {
        status = 'connected'
      } else if (iceState === 'disconnected' || connState === 'disconnected') {
        status = 'disconnected'
      } else if (iceState === 'failed' || connState === 'failed') {
        status = 'failed'
      }
      
      const connectionStatus: ConnectionStatus = {
        userId: otherUserId,
        status,
        iceConnectionState: iceState,
        connectionState: connState,
      }
      
      this.callState.connectionStatuses.set(otherUserId, connectionStatus)
      this.notifyStateChange()
      
      if (this.onConnectionStatusChangeCallback) {
        this.onConnectionStatusChangeCallback(otherUserId, connectionStatus)
      }
    }

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState
      console.log(`ICE connection state for ${otherUserId}:`, state)
      
      updateConnectionStatus()
      
      if (state === 'failed') {
        console.warn(`ICE connection failed for ${otherUserId}, attempting restart...`)
        // Try to restart ICE
        try {
          peerConnection.restartIce()
        } catch (error) {
          console.error('Error restarting ICE:', error)
          // If restart fails, try recreating the connection
          setTimeout(() => {
            if (this.callState.peerConnections.has(otherUserId)) {
              console.log(`Recreating peer connection for ${otherUserId}`)
              this.callState.peerConnections.delete(otherUserId)
              const isInitiator = this.userId < otherUserId
              this.createPeerConnection(otherUserId, isInitiator).catch(console.error)
            }
          }, 2000)
        }
      } else if (state === 'disconnected') {
        console.warn(`ICE connection disconnected for ${otherUserId}`)
        // Try to reconnect after a delay
        setTimeout(() => {
          if (peerConnection.iceConnectionState === 'disconnected' && 
              this.callState.peerConnections.has(otherUserId)) {
            console.log(`Attempting to reconnect to ${otherUserId}`)
            peerConnection.restartIce()
          }
        }, 3000)
      } else if (state === 'connected' || state === 'completed') {
        console.log(`✅ ICE connection established with ${otherUserId}`)
      }
    }
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState
      console.log(`Connection state for ${otherUserId}:`, state)
      updateConnectionStatus()
      
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.callState.remoteStreams.delete(otherUserId)
        if (this.onRemoteStreamRemovedCallback) {
          this.onRemoteStreamRemovedCallback(otherUserId)
        }
        this.notifyStateChange()
      }
    }
    
    // Handle ICE gathering state
    peerConnection.onicegatheringstatechange = () => {
      console.log(`ICE gathering state for ${otherUserId}:`, peerConnection.iceGatheringState)
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

    // Create and send offer if we're the initiator
    if (isInitiator && this.callState.localStream) {
      try {
        console.log(`🎯 Creating offer for ${otherUserId} (we are initiator)`)
        
        // Wait for ICE gathering to start
        await new Promise<void>((resolve) => {
          if (peerConnection.iceGatheringState === 'complete') {
            resolve()
          } else {
            const checkState = () => {
              if (peerConnection.iceGatheringState !== 'new') {
                resolve()
              } else {
                setTimeout(checkState, 100)
              }
            }
            checkState()
          }
        })
        
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: this.callState.isVideoEnabled,
        })
        
        await peerConnection.setLocalDescription(offer)
        console.log(`✅ Local description set for ${otherUserId}`)
        
        // Wait a bit for ICE candidates to be gathered (but not too long)
        await new Promise(resolve => setTimeout(resolve, 300))
        
        await this.sendOffer(otherUserId, offer)
        console.log(`✅ Offer sent to ${otherUserId}`)
      } catch (error) {
        console.error('❌ Error creating offer:', error)
        throw error
      }
    } else if (!isInitiator) {
      // We're not the initiator, so we wait for an offer
      // But add a timeout fallback in case the other user hasn't started the call
      console.log(`⏳ Waiting for offer from ${otherUserId} (we are responder)`)
      
      // Set a timeout - if no offer comes within 5 seconds, check if we should create one
      setTimeout(async () => {
        // Check if we still don't have a remote description and no offer has been received
        if (peerConnection.signalingState === 'stable' && !peerConnection.remoteDescription) {
          console.log(`⏰ Timeout waiting for offer from ${otherUserId}, checking if we should create offer as fallback...`)
          
          // Check if there are any pending offers in Firebase
          const signalingRef = ref(database, `rooms/${this.roomId}/signaling/${otherUserId}`)
          const signalingSnapshot = await get(signalingRef)
          const signaling = signalingSnapshot.val()
          
          const hasOffer = signaling && Object.values(signaling).some((msg: any) => msg.type === 'offer')
          
          if (!hasOffer) {
            console.log(`🔄 No offer found from ${otherUserId}, creating offer as fallback (both users might be waiting)`)
            // Create offer as fallback
            try {
              const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: this.callState.isVideoEnabled,
              })
              
              await peerConnection.setLocalDescription(offer)
              await new Promise(resolve => setTimeout(resolve, 300))
              await this.sendOffer(otherUserId, offer)
              console.log(`✅ Fallback offer sent to ${otherUserId}`)
            } catch (error) {
              console.error('❌ Error creating fallback offer:', error)
            }
          } else {
            console.log(`✅ Offer found from ${otherUserId}, waiting for it to be processed...`)
          }
        }
      }, 5000) // 5 second timeout
    }
  }

  // Set up signaling listeners
  private async setupSignaling(): Promise<void> {
    // Listen for new users joining (for group calls - supports multiple users)
    const usersRef = ref(database, `rooms/${this.roomId}/users`)
    const unsubscribeUsers = onValue(usersRef, async (snapshot) => {
      const users = snapshot.val()
      if (users && this.callState.isInCall) {
        const userEntries = Object.entries(users)
        console.log(`Users in room: ${userEntries.length}, creating connections...`)
        
        for (const [otherUserId, _] of userEntries) {
          if (otherUserId !== this.userId && 
              !this.callState.peerConnections.has(otherUserId as string)) {
            // Determine who should be the initiator (lower user ID creates offer)
            // This ensures only one user creates the offer, preventing conflicts
            const isInitiator = this.userId < (otherUserId as string)
            console.log(`👤 New user ${otherUserId} joined`)
            console.log(`🔀 User ID comparison: ${this.userId} < ${otherUserId} = ${isInitiator}`)
            console.log(`📞 Creating peer connection, isInitiator: ${isInitiator}`)
            await this.createPeerConnection(otherUserId as string, isInitiator)
          }
        }
      }
    })
    this.signalingUnsubscribers.set('users', unsubscribeUsers)

    // Listen for signaling messages
    const signalingRef = ref(database, `rooms/${this.roomId}/signaling`)
    console.log(`👂 Setting up signaling listener for room ${this.roomId}`)
    
    const unsubscribeSignaling = onValue(signalingRef, (snapshot) => {
      const signaling = snapshot.val()
      if (!signaling) {
        console.log('📭 No signaling messages found (this is normal if no one has sent messages yet)')
        return
      }

      const signalingKeys = Object.keys(signaling)
      console.log(`📨 Signaling data received from ${signalingKeys.length} user(s):`, signalingKeys)
      
      for (const [fromUserId, messages] of Object.entries(signaling)) {
        if (fromUserId === this.userId) {
          console.log(`⏭️ Skipping own messages from ${fromUserId}`)
          continue
        }

        const messagesObj = messages as Record<string, SignalingMessage>
        if (!messagesObj) {
          console.log(`⚠️ No messages object for ${fromUserId}`)
          continue
        }

        const messageCount = Object.keys(messagesObj).length
        console.log(`📬 Processing ${messageCount} message(s) from ${fromUserId}`)

        for (const [messageId, message] of Object.entries(messagesObj)) {
          console.log(`📩 Message ${messageId.substring(0, 20)}... from ${fromUserId}, type: ${message.type}`)
          
          // Process message asynchronously
          this.handleSignalingMessage(fromUserId, message as SignalingMessage, messageId).then(() => {
            console.log(`✅ Successfully processed message ${messageId.substring(0, 20)}... from ${fromUserId}`)
            // Clean up processed message after a longer delay to ensure it's been processed
            setTimeout(() => {
              const messageRef = ref(database, `rooms/${this.roomId}/signaling/${fromUserId}/${messageId}`)
              remove(messageRef).then(() => {
                console.log(`🗑️ Cleaned up message ${messageId.substring(0, 20)}... from ${fromUserId}`)
              }).catch(console.error)
            }, 5000) // Increased to 5 seconds to ensure message is processed
          }).catch((error) => {
            console.error(`❌ Error processing message ${messageId} from ${fromUserId}:`, error)
          })
        }
      }
    }, (error) => {
      console.error('❌ Error in signaling listener:', error)
    })
    this.signalingUnsubscribers.set('signaling', unsubscribeSignaling)
    console.log(`✅ Signaling listener set up`)
  }

  // Handle incoming signaling messages
  private async handleSignalingMessage(fromUserId: string, message: SignalingMessage, messageId: string): Promise<void> {
    console.log(`🔍 Handling message from ${fromUserId}, type: ${message.type}, messageId: ${messageId}`)
    
    // Only handle messages if we're in a call
    if (!this.callState.isInCall) {
      console.log(`⚠️ Not in call, ignoring message from ${fromUserId}`)
      return
    }

    // Skip if already processed
    const messageKey = `${fromUserId}_${messageId}`
    if (this.processedMessages.has(messageKey)) {
      console.log(`⏭️ Message ${messageId} from ${fromUserId} already processed, skipping`)
      return
    }
    this.processedMessages.add(messageKey)
    console.log(`✅ Processing new message ${messageId} from ${fromUserId}`)

    let peerConnection = this.callState.peerConnections.get(fromUserId)

    if (message.type === 'offer') {
      console.log(`📥 Received offer from ${fromUserId}`)
      console.log(`📥 Offer SDP: ${message.sdp.type}, length: ${message.sdp.sdp?.length || 0}`)
      
      if (!peerConnection) {
        console.log(`🔧 No peer connection exists for ${fromUserId}, creating as responder...`)
        // Create peer connection as responder (not initiator)
        await this.createPeerConnection(fromUserId, false)
        peerConnection = this.callState.peerConnections.get(fromUserId)
        console.log(`✅ Peer connection created for ${fromUserId}`)
      } else {
        console.log(`✅ Peer connection already exists for ${fromUserId}`)
      }

      if (peerConnection) {
        try {
          console.log(`🔧 Setting remote description (offer) from ${fromUserId}...`)
          // Set remote description first
          await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
          console.log(`✅ Remote description (offer) set from ${fromUserId}`)
          
          // Process any queued ICE candidates
          const queuedCandidates = this.iceCandidateQueue.get(fromUserId)
          if (queuedCandidates && queuedCandidates.length > 0) {
            console.log(`📦 Processing ${queuedCandidates.length} queued ICE candidates from ${fromUserId}`)
            for (const candidate of queuedCandidates) {
              try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
              } catch (error) {
                console.error('Error adding queued ICE candidate:', error)
              }
            }
            this.iceCandidateQueue.delete(fromUserId)
          }
          
          console.log(`🔧 Creating answer for ${fromUserId}...`)
          // Create and send answer
          const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: this.callState.isVideoEnabled,
          })
          
          console.log(`🔧 Setting local description (answer) for ${fromUserId}...`)
          await peerConnection.setLocalDescription(answer)
          console.log(`✅ Local description (answer) set for ${fromUserId}`)
          
          // Wait a bit for ICE candidates (but not too long)
          await new Promise(resolve => setTimeout(resolve, 300))
          
          console.log(`📤 Sending answer to ${fromUserId}`)
          await this.sendAnswer(fromUserId, answer)
          console.log(`✅ Answer sent to ${fromUserId}`)
        } catch (error) {
          console.error(`❌ Error handling offer from ${fromUserId}:`, error)
          console.error('Error details:', error instanceof Error ? error.stack : error)
        }
      } else {
        console.error(`❌ Failed to create/get peer connection for ${fromUserId}`)
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
    const messageId = `offer_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    const userName = await this.getUserName()
    
    console.log(`📤 Sending offer to ${toUserId}, messageId: ${messageId}`)
    console.log(`📤 Offer SDP type: ${offer.type}, length: ${offer.sdp?.length || 0}`)
    
    await set(ref(database, `rooms/${this.roomId}/signaling/${this.userId}/${messageId}`), {
      type: 'offer',
      sdp: offer,
      fromUserId: this.userId,
      fromUserName: userName,
      timestamp: Date.now(),
    } as CallOffer)
    
    console.log(`✅ Offer sent to ${toUserId} at path: rooms/${this.roomId}/signaling/${this.userId}/${messageId}`)
  }

  // Send answer
  private async sendAnswer(toUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const messageId = `answer_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    console.log(`📤 Sending answer to ${toUserId}, messageId: ${messageId}`)
    console.log(`📤 Answer SDP type: ${answer.type}, length: ${answer.sdp?.length || 0}`)
    
    await set(ref(database, `rooms/${this.roomId}/signaling/${this.userId}/${messageId}`), {
      type: 'answer',
      sdp: answer,
      fromUserId: this.userId,
      timestamp: Date.now(),
    } as CallAnswer)
    
    console.log(`✅ Answer sent to ${toUserId} at path: rooms/${this.roomId}/signaling/${this.userId}/${messageId}`)
  }

  // Send ICE candidate
  private async sendICECandidate(toUserId: string, candidate: RTCIceCandidate): Promise<void> {
    const messageId = `ice_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    // Don't log every ICE candidate (too verbose), but log occasionally
    if (Math.random() < 0.1) { // Log 10% of ICE candidates
      console.log(`📤 Sending ICE candidate to ${toUserId} (${messageId.substring(0, 20)}...)`)
    }
    
    await set(ref(database, `rooms/${this.roomId}/signaling/${this.userId}/${messageId}`), {
      type: 'ice-candidate',
      candidate: candidate.toJSON(),
      fromUserId: this.userId,
      timestamp: Date.now(),
    } as ICECandidate)
  }

  // Prefer specific codecs in SDP (simplified to avoid breaking SDP)
  private preferCodecs(sdp: string, codecs: { video?: string[]; audio?: string[] }): string {
    // Don't modify SDP if it might break - let browser handle codec selection
    // This is a simplified version that just ensures the SDP is valid
    return sdp
    
    // Original codec preference code was too complex and could break SDP
    // Browser's default codec selection is usually better
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

