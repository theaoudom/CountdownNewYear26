# WebRTC Audio/Video Call Implementation

## Current Implementation

This application uses WebRTC for peer-to-peer audio and video calls. The implementation includes:

- **STUN servers** for NAT traversal
- **TURN servers** for better mobile/NAT connectivity (using free public servers)
- **Automatic reconnection** on connection failures
- **Codec optimization** for better quality
- **Mobile-specific optimizations**

## Known Limitations

### Current Issues:
1. **Free TURN servers** may have rate limits and reliability issues
2. **Mobile browsers** can be more restrictive with WebRTC
3. **Network conditions** affect connection quality
4. **No server-side media relay** - all traffic is peer-to-peer

### For Production Use:

Consider using a professional solution like:

#### Option 1: Jitsi Meet (Recommended for Production)
- Free, open-source video conferencing
- Built-in TURN servers
- Better mobile support
- Scalable architecture
- Easy to integrate

**Integration example:**
```typescript
// Instead of custom WebRTC, embed Jitsi Meet
const jitsiDomain = 'meet.jit.si'
const roomName = roomCode
const options = {
  roomName: roomName,
  width: '100%',
  height: '100%',
  parentNode: document.querySelector('#jitsi-container'),
  configOverwrite: {
    startWithAudioMuted: false,
    startWithVideoMuted: false,
  },
  interfaceConfigOverwrite: {
    TOOLBAR_BUTTONS: [
      'microphone', 'camera', 'hangup', 'settings'
    ],
  },
}
const api = new JitsiMeetExternalAPI(jitsiDomain, options)
```

#### Option 2: Paid TURN Services
- **Twilio STUN/TURN**: Reliable, paid service
- **Xirsys**: Professional TURN service
- **Metered.ca**: Affordable TURN service

#### Option 3: Self-Hosted TURN Server
- Use `coturn` or similar
- Requires server infrastructure
- Full control but more maintenance

## Mobile Browser Support

### iOS Safari:
- Requires user interaction to start media
- May need `playsInline` attribute
- Better with HTTPS

### Android Chrome:
- Generally good support
- May need permissions prompt handling

## Troubleshooting

### Audio/Video Not Working:

1. **Check browser console** for errors
2. **Verify permissions** - browser may have blocked camera/mic
3. **Check network** - TURN servers may be blocked
4. **Try different browsers** - some have better WebRTC support
5. **Check firewall/NAT** - may need TURN servers

### Mobile Issues:

1. **Use HTTPS** - required for getUserMedia on mobile
2. **User interaction** - media must start from user action
3. **Permissions** - ensure camera/mic permissions granted
4. **Network** - mobile networks may have stricter NAT

## Improving Current Implementation

If you want to keep the current WebRTC implementation:

1. **Add paid TURN servers** for better reliability
2. **Implement connection quality monitoring**
3. **Add bandwidth adaptation**
4. **Implement reconnection logic**
5. **Add error recovery mechanisms**

## Recommendation

For a production countdown app with video calls, **Jitsi Meet integration** would provide:
- Better reliability
- Better mobile support
- Less maintenance
- Professional features (screen sharing, recording, etc.)
- Better scalability

The current WebRTC implementation works but may have issues on mobile devices or behind strict NATs without proper TURN servers.

