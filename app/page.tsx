'use client'

import { useState, useEffect, useRef } from 'react'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const confettiRef = useRef<ConfettiPiece[]>([])
  const animationFrameRef = useRef<number>()
  const confettiAnimationRef = useRef<number>()

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
  const TEST_TARGET_DATE = '2025-12-30T17:29:00' // December 30, 2025, 4:56 PM
  
  // Target date: January 1, 2026, 00:00:00 (production)
  // Or test date if TEST_MODE is enabled
  const targetDate = TEST_MODE 
    ? new Date(TEST_TARGET_DATE).getTime()
    : new Date('2026-01-01T00:00:00').getTime()

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime()
      const difference = targetDate - now

      if (difference <= 0) {
        setIsNewYear(true)
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        
        // Staged reveal sequence (without bright flash)
        // Step 1: Show main message
        setTimeout(() => {
          setShowMessage(true)
        }, 300)
        
        // Step 2: Start fireworks (after message appears)
        setTimeout(() => {
          setShowFireworks(true)
        }, 1500)
        
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

      setTimeLeft({ days, hours, minutes, seconds })
    }

    // Calculate immediately
    calculateTimeLeft()

    // Update every second
    const interval = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(interval)
  }, [targetDate])

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
      const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#E74C3C'
      ]
      const particleCount = 50 + Math.random() * 30

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
      if (Math.random() > 0.3) {
        launchFirework()
      }
    }, 2000)

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

  // Easter egg handler
  const handleEasterEgg = () => {
    if (!isNewYear) return
    
    setEasterEggActive(true)
    
    // Trigger extra intense fireworks burst
    if (canvasRef.current && showFireworks) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (ctx) {
        // Create multiple explosions at once
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            const x = Math.random() * canvas.width
            const y = 100 + Math.random() * (canvas.height * 0.5)
            
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#F7DC6F', '#BB8FCE', '#F8B739', '#E74C3C']
            const particleCount = 80
            
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
      {/* Glowing orbs background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
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

      {/* Sparkle effects around countdown */}
      {!isNewYear && (
        <div className="absolute inset-0 pointer-events-none z-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-sparkle"
              style={{
                left: `${15 + (i * 10)}%`,
                top: `${30 + (i % 2) * 40}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: `${2 + (i % 2)}s`,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 0L12 7L19 10L12 13L10 20L8 13L1 10L8 7L10 0Z" fill="currentColor" className="text-yellow-300 opacity-80" />
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
            {timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes < 1 && (
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

function TimeUnit({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="text-5xl md:text-7xl lg:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-pink-400 to-purple-400 drop-shadow-lg">
        {String(value).padStart(2, '0')}
      </div>
      <div className="text-lg md:text-xl text-gray-300 uppercase tracking-wider">
        {label}
      </div>
    </div>
  )
}

