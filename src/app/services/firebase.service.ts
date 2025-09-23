import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User } from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc, addDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, deleteDoc, writeBatch } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Database structure interfaces
interface UserData {
  email: string;
  createdAt: string;
  name?: string;
  photo?: string;
  lastLoginAt?: string;
}

interface UserProgress {
  overallStats: {
    accuracy: number;
    avgTimePerCard: number;
    totalCards: number;
    skippedCards: number;
  };
  categoryStats: {
    name: string;
    icon: string;
    accuracy: number;
    cardsPlayed: number;
    avgTime: number;
  }[];
  lastCalculated: string;
}

interface GameSession {
  category: string;
  correctAnswers: number;
  totalQuestions: number;
  totalTime: number;
  skipped: number;
  timestamp: string;
}

interface UserCategory {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  createdAt: number;
  userId: string;
}

interface UserCard {
  id: string;
  categoryId: string;
  userId: string;
  type: 'photo' | 'video' | 'manual';
  src: string;
  label?: string;
  audio?: string | null;
  duration?: number;
  createdAt: number;
}

interface TrustedContact {
  id: string;
  patientUserId: string;
  caregiverUserId: string;
  patientName?: string;
  caregiverName?: string;
  patientEmail?: string;
  caregiverEmail?: string;
  createdAt: string;
  createdBy: string;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private storage = inject(Storage);

  constructor() {
    console.log('Firebase service initialized successfully');
  }

  async login(email: string, password: string): Promise<User> {
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    return userCredential.user;
  }

  async signup(email: string, password: string, name?: string): Promise<User> {
    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
    const uid = userCredential.user.uid;

    // Create user document with profile data
    const userData: UserData = {
      email: email,
      createdAt: new Date().toISOString(),
      ...(name && { name })
    };

    await setDoc(doc(this.firestore, 'users', uid), userData);

    // Initialize user progress document
    const initialProgress: UserProgress = {
      overallStats: {
        accuracy: 0,
        avgTimePerCard: 0,
        totalCards: 0,
        skippedCards: 0
      },
      categoryStats: [
        { name: 'People', icon: '👨‍👩‍👧‍👦', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
        { name: 'Places', icon: '🏠', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
        { name: 'Objects', icon: '📱', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
        { name: 'Photo Memories', icon: '📸', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
        { name: 'Video Memories', icon: '🎥', accuracy: 0, cardsPlayed: 0, avgTime: 0 }
      ],
      lastCalculated: new Date().toISOString()
    };

    await setDoc(doc(this.firestore, 'users', uid, 'userProgress', 'stats'), initialProgress);

    return userCredential.user;
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  getCurrentUser(): User | null {
    return this.auth.currentUser;
  }

  async getUserData(uid: string) {
    const docRef = doc(this.firestore, 'users', uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  }

  // Progress tracking methods
  async saveGameSession(sessionData: Omit<GameSession, 'timestamp'>): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const gameSession: GameSession = {
      ...sessionData,
      timestamp: new Date().toISOString()
    };

    // Save to users/{uid}/userProgress/stats/gameSessions/{sessionId}
    await addDoc(
      collection(this.firestore, 'users', user.uid, 'userProgress', 'stats', 'gameSessions'),
      gameSession
    );
  }

  async getUserGameSessions(userId?: string): Promise<GameSession[]> {
    const user = this.getCurrentUser();
    const targetUserId = userId || user?.uid;

    if (!targetUserId) throw new Error('User not authenticated');

    const q = query(
      collection(this.firestore, 'users', targetUserId, 'userProgress', 'stats', 'gameSessions'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as GameSession);
  }

  async saveUserProgress(progressData: Partial<UserProgress>): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const updatedProgress = {
      ...progressData,
      lastUpdated: new Date().toISOString()
    };

    await setDoc(
      doc(this.firestore, 'users', user.uid, 'userProgress', 'stats'),
      updatedProgress,
      { merge: true }
    );
  }

  async getUserProgress(userId?: string): Promise<UserProgress | null> {
    const user = this.getCurrentUser();
    const targetUserId = userId || user?.uid;

    if (!targetUserId) throw new Error('User not authenticated');

    const docRef = doc(this.firestore, 'users', targetUserId, 'userProgress', 'stats');
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as UserProgress : null;
  }

  // ===== USER GALLERY MANAGEMENT =====

  /**
   * Create a new custom category for the current user
   */
  async createUserCategory(categoryData: Omit<UserCategory, 'id' | 'userId' | 'createdAt'>): Promise<string> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const categoryId = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const category: UserCategory = {
      id: categoryId,
      userId: user.uid,
      createdAt: Date.now(),
      ...categoryData
    };

    await setDoc(doc(this.firestore, 'userCategories', categoryId), category);
    return categoryId;
  }

  /**
   * Get all categories for the current user
   */
  async getUserCategories(userId?: string): Promise<UserCategory[]> {
    const user = this.getCurrentUser();
    const targetUserId = userId || user?.uid;

    if (!targetUserId) throw new Error('User not authenticated');

    const q = query(
      collection(this.firestore, 'userCategories'),
      where('userId', '==', targetUserId),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as UserCategory);
  }

  /**
   * Update a user category
   */
  async updateUserCategory(categoryId: string, updates: Partial<Omit<UserCategory, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Verify ownership
    const categoryDoc = await getDoc(doc(this.firestore, 'userCategories', categoryId));
    const categoryData = categoryDoc.data() as UserCategory;
    if (!categoryDoc.exists() || categoryData?.userId !== user.uid) {
      throw new Error('Category not found or access denied');
    }

    await updateDoc(doc(this.firestore, 'userCategories', categoryId), updates);
  }

  /**
   * Delete a user category and all its cards
   */
  async deleteUserCategory(categoryId: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Verify ownership
    const categoryDoc = await getDoc(doc(this.firestore, 'userCategories', categoryId));
    const categoryData = categoryDoc.data() as UserCategory;
    if (!categoryDoc.exists() || categoryData?.userId !== user.uid) {
      throw new Error('Category not found or access denied');
    }

    // Delete all cards in this category
    const cardsQuery = query(
      collection(this.firestore, 'userCards'),
      where('categoryId', '==', categoryId),
      where('userId', '==', user.uid)
    );

    const cardsSnapshot = await getDocs(cardsQuery);
    const batch = writeBatch(this.firestore);

    cardsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete the category
    batch.delete(doc(this.firestore, 'userCategories', categoryId));

    await batch.commit();
  }

  // ===== USER CARD MANAGEMENT =====

  /**
   * Add a new card to a user's category
   */
  async createUserCard(cardData: Omit<UserCard, 'id' | 'userId' | 'createdAt'>): Promise<string> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Verify category ownership
    const categoryDoc = await getDoc(doc(this.firestore, 'userCategories', cardData.categoryId));
    const categoryData = categoryDoc.data() as UserCategory;
    if (!categoryDoc.exists() || categoryData?.userId !== user.uid) {
      throw new Error('Category not found or access denied');
    }

    const cardId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const card: UserCard = {
      id: cardId,
      userId: user.uid,
      createdAt: Date.now(),
      ...cardData
    };

    await setDoc(doc(this.firestore, 'userCards', cardId), card);
    return cardId;
  }

  /**
   * Get all cards for a specific category
   */
  async getUserCards(categoryId: string, userId?: string): Promise<UserCard[]> {
    const user = this.getCurrentUser();
    const targetUserId = userId || user?.uid;

    if (!targetUserId) throw new Error('User not authenticated');

    const q = query(
      collection(this.firestore, 'userCards'),
      where('categoryId', '==', categoryId),
      where('userId', '==', targetUserId),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as UserCard);
  }

  /**
   * Get all cards for a user across all categories
   */
  async getAllUserCards(userId?: string): Promise<UserCard[]> {
    const user = this.getCurrentUser();
    const targetUserId = userId || user?.uid;

    if (!targetUserId) throw new Error('User not authenticated');

    const q = query(
      collection(this.firestore, 'userCards'),
      where('userId', '==', targetUserId),
      orderBy('createdAt', 'desc'),
      limit(500) // Reasonable limit
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as UserCard);
  }

  /**
   * Update a user card
   */
  async updateUserCard(cardId: string, updates: Partial<Omit<UserCard, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Verify ownership
    const cardDoc = await getDoc(doc(this.firestore, 'userCards', cardId));
    const cardData = cardDoc.data() as UserCard;
    if (!cardDoc.exists() || cardData?.userId !== user.uid) {
      throw new Error('Card not found or access denied');
    }

    await updateDoc(doc(this.firestore, 'userCards', cardId), updates);
  }

  /**
   * Delete a user card
   */
  async deleteUserCard(cardId: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Verify ownership
    const cardDoc = await getDoc(doc(this.firestore, 'userCards', cardId));
    const cardData = cardDoc.data() as UserCard;
    if (!cardDoc.exists() || cardData?.userId !== user.uid) {
      throw new Error('Card not found or access denied');
    }

    await deleteDoc(doc(this.firestore, 'userCards', cardId));
  }

  // ===== FILE UPLOAD MANAGEMENT =====

  /**
   * Upload a file (image/audio) to Firebase Storage
   */
  async uploadFile(file: Blob, path: string): Promise<string> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const storageRef = ref(this.storage, `users/${user.uid}/${path}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  }

  /**
   * Delete a file from Firebase Storage
   */
  async deleteFile(path: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const storageRef = ref(this.storage, `users/${user.uid}/${path}`);
    await deleteObject(storageRef);
  }

  // ===== DATA MIGRATION HELPERS =====

  /**
   * Migrate local storage data to Firebase for the current user
   */
  async migrateLocalDataToFirebase(): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    console.log('🔄 Starting data migration to Firebase...');

    // Migrate custom categories
    const localCategories = localStorage.getItem('alala_custom_categories_v1');
    if (localCategories) {
      const categories = JSON.parse(localCategories);
      for (const category of categories) {
        try {
          await this.createUserCategory({
            name: category.name,
            description: category.description,
            emoji: category.emoji
          });
          console.log(`✅ Migrated category: ${category.name}`);
        } catch (error) {
          console.error(`❌ Failed to migrate category ${category.name}:`, error);
        }
      }
    }

    // Migrate game sessions
    const localSessions = localStorage.getItem('gameSessions');
    if (localSessions) {
      const sessions = JSON.parse(localSessions);
      for (const session of sessions) {
        try {
          await this.saveGameSession(session);
          console.log(`✅ Migrated game session from ${session.timestamp}`);
        } catch (error) {
          console.error(`❌ Failed to migrate game session:`, error);
        }
      }
    }

    console.log('✅ Data migration completed');
  }

  /**
   * Clear all user data (for account deletion)
   */
  async clearAllUserData(): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const batch = writeBatch(this.firestore);

    // Delete all user categories
    const categoriesQuery = query(
      collection(this.firestore, 'userCategories'),
      where('userId', '==', user.uid)
    );
    const categoriesSnapshot = await getDocs(categoriesQuery);
    categoriesSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete all user cards
    const cardsQuery = query(
      collection(this.firestore, 'userCards'),
      where('userId', '==', user.uid)
    );
    const cardsSnapshot = await getDocs(cardsQuery);
    cardsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete all game sessions
    const sessionsQuery = query(
      collection(this.firestore, 'gameSessions'),
      where('userId', '==', user.uid)
    );
    const sessionsSnapshot = await getDocs(sessionsQuery);
    sessionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete user progress
    batch.delete(doc(this.firestore, 'userProgress', user.uid));

    // Delete user profile
    batch.delete(doc(this.firestore, 'users', user.uid));

    await batch.commit();
  }

  // ===== TRUSTED CONTACTS MANAGEMENT =====

  /**
   * Add a trusted contact relationship
   */
  async addTrustedContact(patientUserId: string, caregiverUserId: string, contactInfo: any): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Only the patient or caregiver can create this relationship
    if (user.uid !== patientUserId && user.uid !== caregiverUserId) {
      throw new Error('Access denied');
    }

    const contactId = `${caregiverUserId}_${patientUserId}`;
    const trustedContact = {
      id: contactId,
      patientUserId,
      caregiverUserId,
      ...contactInfo,
      createdAt: new Date().toISOString(),
      createdBy: user.uid
    };

    await setDoc(doc(this.firestore, 'trustedContacts', contactId), trustedContact);
  }

  /**
   * Get trusted contacts for a user (both as patient and caregiver)
   */
  async getTrustedContacts(): Promise<any[]> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Get contacts where user is the patient
    const asPatientQuery = query(
      collection(this.firestore, 'trustedContacts'),
      where('patientUserId', '==', user.uid)
    );

    // Get contacts where user is the caregiver
    const asCaregiverQuery = query(
      collection(this.firestore, 'trustedContacts'),
      where('caregiverUserId', '==', user.uid)
    );

    const [patientSnapshot, caregiverSnapshot] = await Promise.all([
      getDocs(asPatientQuery),
      getDocs(asCaregiverQuery)
    ]);

    const contacts = [
      ...patientSnapshot.docs.map(doc => ({ ...doc.data(), role: 'patient' })),
      ...caregiverSnapshot.docs.map(doc => ({ ...doc.data(), role: 'caregiver' }))
    ];

    return contacts;
  }

  /**
   * Remove a trusted contact relationship
   */
  async removeTrustedContact(contactId: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Verify the user is part of this relationship
    const contactDoc = await getDoc(doc(this.firestore, 'trustedContacts', contactId));
    if (!contactDoc.exists()) {
      throw new Error('Contact relationship not found');
    }

    const contactData = contactDoc.data() as TrustedContact;
    if (contactData?.patientUserId !== user.uid && contactData?.caregiverUserId !== user.uid) {
      throw new Error('Access denied');
    }

    await deleteDoc(doc(this.firestore, 'trustedContacts', contactId));
  }

  /**
   * Verify if a user can access another user's data (trusted contact check)
   */
  async canAccessUserData(targetUserId: string): Promise<boolean> {
    const user = this.getCurrentUser();
    if (!user) return false;

    // Users can always access their own data
    if (user.uid === targetUserId) return true;

    // Check if there's a trusted contact relationship
    const contactId = `${user.uid}_${targetUserId}`;
    const contactDoc = await getDoc(doc(this.firestore, 'trustedContacts', contactId));

    return contactDoc.exists();
  }
}
