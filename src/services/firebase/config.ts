import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDmjJDboyNhdKw5nYB3RydCND6xFphprGw',
  authDomain: 'shop-keeper-58e37.firebaseapp.com',
  projectId: 'shop-keeper-58e37',
  storageBucket: 'shop-keeper-58e37.firebasestorage.app',
  messagingSenderId: '986896386614',
  appId: '1:986896386614:web:e33a4f4c7b037f54e2e697',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);