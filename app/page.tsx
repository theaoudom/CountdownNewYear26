'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

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
  const targetDate = TEST_MODE 
    ? new Date(TEST_TARGET_DATE).getTime()
    : new Date('2026-01-01T00:00:00').getTime()

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

