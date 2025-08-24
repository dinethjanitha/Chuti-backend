import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Firebase Admin SDK configuration
const firebaseConfig = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
  universe_domain: "googleapis.com"
};

// Check if Firebase credentials are provided
const isFirebaseConfigured = process.env.FIREBASE_PROJECT_ID && 
                            process.env.FIREBASE_PRIVATE_KEY && 
                            process.env.FIREBASE_CLIENT_EMAIL;

// Initialize Firebase Admin
let firebaseApp = null;
let auth = null;
let firestore = null;
let database = null;

if (isFirebaseConfigured) {
  try {
    if (!admin.apps.length) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    } else {
      firebaseApp = admin.app();
    }
    
    // Export Firebase services
    auth = admin.auth();
    firestore = admin.firestore();
    database = admin.database();
    
    console.log('🔥 Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error.message);
    console.log('💡 Please ensure your Firebase credentials are properly configured in .env file');
  }
} else {
  console.log('⚠️  Firebase not configured. OAuth features will be disabled.');
  console.log('💡 To enable Firebase OAuth, add the following to your .env file:');
  console.log('   FIREBASE_PROJECT_ID=your-project-id');
  console.log('   FIREBASE_PRIVATE_KEY=your-private-key');
  console.log('   FIREBASE_CLIENT_EMAIL=your-client-email');
}

// Export Firebase services (will be null if not configured)
export { auth, firestore, database, isFirebaseConfigured };
export default firebaseApp;
