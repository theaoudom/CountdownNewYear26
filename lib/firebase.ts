import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDMZO9eJcDW83pz0yFRGaKslXlQhOR-tIA",
  authDomain: "countdownroom.firebaseapp.com",
  databaseURL: "https://countdownroom-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "countdownroom",
  storageBucket: "countdownroom.firebasestorage.app",
  messagingSenderId: "1041294691900",
  appId: "1:1041294691900:web:9451d3c0a198861d7dfd39",
  measurementId: "G-ZNJ3DS7EQ6"
}

// Initialize Firebase
let app: ReturnType<typeof initializeApp>
let database: ReturnType<typeof getDatabase>

try {
  app = initializeApp(firebaseConfig)
  database = getDatabase(app)
  
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('✅ Firebase initialized')
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error)
  throw error
}

export { database }
export default app

