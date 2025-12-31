# Welcome 2026 - New Year Countdown

A beautiful Next.js 13+ application featuring a real-time countdown to New Year 2026 with animated fireworks celebration.

## Features

- ⏰ Real-time countdown timer (Days, Hours, Minutes, Seconds)
- 🎆 Animated fireworks display after countdown ends
- 🌟 Floating stars background effect
- 📱 Fully responsive design
- 🎨 Beautiful gradient backgrounds and animations
- ⚡ Performance-optimized with Canvas API

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## How It Works

### Countdown Timer

The countdown calculates the time difference between the current moment and January 1, 2026 at 00:00:00. It updates every second using `setInterval` and displays:
- **Days**: Full days remaining
- **Hours**: Hours remaining in the current day
- **Minutes**: Minutes remaining in the current hour
- **Seconds**: Seconds remaining in the current minute

When the countdown reaches zero, it triggers the New Year celebration.

### Fireworks Animation

The fireworks system uses HTML5 Canvas for smooth, performant animations:

1. **Rocket Launch**: Fireworks launch from random positions at the bottom of the screen
2. **Explosion**: When rockets reach their target height, they explode into multiple colorful particles
3. **Physics**: Each particle has:
   - Velocity (vx, vy) for movement
   - Gravity effect (particles fall down)
   - Friction (particles slow down)
   - Life cycle (particles fade out over time)
4. **Colors**: Random vibrant colors for each particle
5. **Continuous**: New fireworks launch every 2 seconds after the countdown ends

### Technical Implementation

- **React Hooks**: `useState` for state management, `useEffect` for side effects
- **Canvas API**: Efficient particle rendering
- **RequestAnimationFrame**: Smooth 60fps animations
- **Tailwind CSS**: Responsive styling with utility classes
- **TypeScript**: Type-safe code

## Project Structure

```
Welcome2026/
├── app/
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Main countdown page
│   └── globals.css     # Global styles & Tailwind
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── next.config.js
```

## Build for Production

```bash
npm run build
npm start
```

## License

MIT



