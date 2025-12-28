import confetti from 'canvas-confetti'

// Basic celebration confetti
export function celebrate() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
  })
}

// Smaller celebration for common actions
export function celebrateSmall() {
  confetti({
    particleCount: 30,
    spread: 50,
    origin: { y: 0.7 },
    colors: ['#f59e0b', '#fbbf24', '#fcd34d'], // amber colors
  })
}

// Big celebration for milestones
export function celebrateBig() {
  const duration = 2000
  const end = Date.now() + duration

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#f59e0b', '#fbbf24', '#fcd34d'],
    })
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#f59e0b', '#fbbf24', '#fcd34d'],
    })

    if (Date.now() < end) {
      requestAnimationFrame(frame)
    }
  }

  frame()
}

// Celebration for recipe creation
export function celebrateRecipe() {
  confetti({
    particleCount: 60,
    spread: 100,
    origin: { y: 0.5 },
    colors: ['#f59e0b', '#22c55e', '#3b82f6'],
  })
}
