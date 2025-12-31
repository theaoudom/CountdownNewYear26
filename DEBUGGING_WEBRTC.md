# WebRTC Connection Debugging Guide

## How to Debug Connection Issues

When testing with two browsers (Chrome and Edge) on localhost, follow these steps:

### 1. Open Browser Console
- **Chrome**: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- **Edge**: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)

### 2. Look for These Log Messages

#### ✅ Good Signs (Connection Working):
- `📤 Sending offer to [userId]`
- `📥 Received offer from [userId]`
- `📤 Sending answer to [userId]`
- `📥 Received answer from [userId]`
- `✅ ICE connection established with [userId]`
- `✅ Connected!`

#### ❌ Problem Signs:
- `⚠️ Not in call, ignoring message` - User started call but WebRTC manager not ready
- `❌ Error handling offer` - Problem processing offer/answer
- `ICE connection state: failed` - Connection failed
- No messages at all - Signaling not working

### 3. Common Issues and Solutions

#### Issue 1: No Signaling Messages
**Symptoms**: No `📤` or `📥` messages in console
**Causes**:
- Firebase Realtime Database not connected
- Database rules blocking writes
- Network issues

**Solution**:
1. Check Firebase connection in console
2. Verify database rules allow read/write
3. Check network tab for Firebase errors

#### Issue 2: Offers/Answers Not Received
**Symptoms**: See `📤 Sending offer` but no `📥 Received offer`
**Causes**:
- Messages deleted too quickly
- Firebase listener not working
- User IDs mismatch

**Solution**:
1. Check if messages appear in Firebase console
2. Verify both users are in the same room
3. Check user IDs match

#### Issue 3: ICE Connection Fails
**Symptoms**: See `ICE connection state: failed`
**Causes**:
- TURN servers not accessible
- Firewall blocking connections
- NAT traversal issues

**Solution**:
1. Check browser console for ICE errors
2. Try different network (mobile hotspot)
3. Check if TURN servers are accessible

#### Issue 4: Both Users Create Offers
**Symptoms**: See offers from both users simultaneously
**Causes**:
- User ID comparison not working
- Race condition

**Solution**:
- Check console for `isInitiator` logs
- Should see only one user creating offer

### 4. Step-by-Step Debugging

1. **User A starts call**:
   - Should see: `Creating peer connections for X other users`
   - Should see: `Creating offer for [UserB]`
   - Should see: `📤 Sending offer to [UserB]`

2. **User B receives offer**:
   - Should see: `📥 Received offer from [UserA]`
   - Should see: `Creating answer for [UserA]`
   - Should see: `📤 Sending answer to [UserA]`

3. **User A receives answer**:
   - Should see: `📥 Received answer from [UserB]`
   - Should see: `Set remote description (answer)`

4. **ICE candidates exchanged**:
   - Should see: `Sending ICE candidate` (multiple times)
   - Should see: `Received ICE candidate` (multiple times)

5. **Connection established**:
   - Should see: `✅ ICE connection established`
   - Should see: `✅ Connected!` in UI

### 5. Quick Fixes

If connection doesn't work:

1. **Refresh both browsers** - Sometimes helps reset state
2. **Check Firebase console** - Verify messages are being written
3. **Check network tab** - Look for failed requests
4. **Try different browsers** - Some browsers have better WebRTC support
5. **Check permissions** - Ensure camera/mic permissions granted

### 6. Testing Checklist

- [ ] Both users in same room
- [ ] Both users started call (audio or video)
- [ ] Console shows signaling messages
- [ ] Console shows ICE candidates
- [ ] Console shows connection established
- [ ] UI shows "Connected!" status
- [ ] Audio/video streams appear

### 7. If Still Not Working

Check the browser console for:
- Red error messages
- Failed network requests
- Permission errors
- WebRTC API errors

Share the console logs to identify the specific issue!

