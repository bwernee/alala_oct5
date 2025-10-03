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
  role?: 'patient' | 'caregiver' | 'standard';
  securityCode?: string;
  patientInfo?: {
    name: string;
    age?: number;
    gender?: string;
    condition?: string;
    dateOfBirth?: string;
    medicalId?: string;
    notes?: string;
  };
  caregiverInfo?: {
    name: string;
    relationship?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
  };
}

interface CategoryMatchSession {
  id: string;
  timestamp: string;
  correct: number;
  total: number;
  accuracy: number;
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
  categoryMatch: {
    sessions: { [sessionId: string]: CategoryMatchSession };
    totalSessions: number;
    overallAccuracy: number;
  };
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

  async signup(
    email: string,
    password: string,
    name?: string,
    patientInfo?: {
      name: string;
      age?: number;
      gender?: string;
      condition?: string;
      dateOfBirth?: string;
      medicalId?: string;
      notes?: string;
    },
    caregiverInfo?: {
      name: string;
      relationship?: string;
      contactEmail?: string;
      contactPhone?: string;
      notes?: string;
    }
  ): Promise<User> {
    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
    const uid = userCredential.user.uid;

    // Generate a unique security code for this account
    const securityCode = await this.generateUniqueSecurityCode();

    // Create user document with profile data (no default data for games/videos/flashcards)
    const userData: UserData = {
      email: email,
      createdAt: new Date().toISOString(),
      ...(name && { name }),
      role: 'standard',
      securityCode,
      // Store provided profiles; avoid undefined writes
      patientInfo: patientInfo ? this.sanitizeForFirestore(patientInfo) as any : undefined,
      caregiverInfo: caregiverInfo ? this.sanitizeForFirestore(caregiverInfo) as any : undefined
    };

    await setDoc(doc(this.firestore, 'users', uid), this.sanitizeForFirestore(userData));

    return userCredential.user;
  }

  /**
   * Create a flashcard under users/{uid}/flashcards and auto-create activity entries.
   * Only allowed for caregivers/standard (not patient mode).
   */
  async createFlashcard(card: Omit<UserCard, 'id' | 'userId' | 'createdAt'> & { type: 'photo' | 'video' | 'manual' }): Promise<string> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // role check (patient cannot create)
    const profile = await this.getUserProfile(user.uid);
    if (profile?.role === 'patient') {
      throw new Error('Patients cannot create content');
    }

    const cardId = `card_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const data: any = this.sanitizeForFirestore({
      id: cardId,
      userId: user.uid,
      createdAt: Date.now(),
      ...card
    });

    await setDoc(doc(this.firestore, 'users', user.uid, 'flashcards', cardId), data);

    // Auto-create activity entries for games referencing this card
    const activities = [
      { id: `nameThatMemory_${cardId}`, type: 'nameThatMemory', cardId },
      { id: `categoryMatch_${cardId}`, type: 'categoryMatch', cardId }
    ];

    for (const a of activities) {
      const activityDoc = doc(this.firestore, 'users', user.uid, 'activities', a.id);
      await setDoc(activityDoc, this.sanitizeForFirestore({
        id: a.id,
        type: a.type,
        cardId: a.cardId,
        createdAt: Date.now()
      }));
    }

    return cardId;
  }

  /**
   * Append a progress entry under users/{uid}/activities/{activityId}/progress
   */
  async addActivityProgress(activityId: string, progress: { correct: number; total: number; durationSec?: number; timestamp?: number }): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const p = this.sanitizeForFirestore({
      correct: Number(progress.correct) || 0,
      total: Number(progress.total) || 0,
      durationSec: progress.durationSec ?? null,
      timestamp: progress.timestamp ?? Date.now(),
      accuracy: (Number(progress.total) > 0) ? Number(progress.correct) / Number(progress.total) : 0
    });

    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    await setDoc(doc(this.firestore, 'users', user.uid, 'activities', activityId, 'progress', id), p);
  }

  /** Prevent undefined from being written to Firestore (convert to null or remove) */
  private sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
    const out: any = {};
    Object.keys(obj || {}).forEach(k => {
      const v = (obj as any)[k];
      if (v === undefined) return; // skip undefined entries
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = this.sanitizeForFirestore(v);
      } else {
        out[k] = v === undefined ? null : v;
      }
    });
    return out;
  }

  private async generateUniqueSecurityCode(): Promise<string> {
    // 8-character uppercase alphanumeric code (e.g., 4G8K2MPL)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 8;
    const generate = () => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

    // Ensure uniqueness across all users by querying the users collection
    while (true) {
      const candidate = generate();
      const q = query(collection(this.firestore, 'users'), where('securityCode', '==', candidate));
      const snap = await getDocs(q);
      if (snap.empty) return candidate;
      // else loop and try again
    }
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

  // ===== PATIENT & CAREGIVER PROFILE MANAGEMENT =====

  /**
   * Update user role and profile information
   */
  async updateUserProfile(profileData: {
    role?: 'patient' | 'caregiver' | 'standard';
    patientInfo?: {
      name: string;
      dateOfBirth?: string;
      medicalId?: string;
      notes?: string;
    };
    caregiverInfo?: {
      name: string;
      relationship?: string;
      contactPhone?: string;
      notes?: string;
    };
  }): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const updates: Partial<UserData> = {
      ...profileData,
      lastLoginAt: new Date().toISOString()
    };

    await updateDoc(doc(this.firestore, 'users', user.uid), updates);
  }

  /**
   * Get user profile with role-specific information
   */
  async getUserProfile(uid?: string): Promise<UserData | null> {
    const user = this.getCurrentUser();
    const targetUid = uid || user?.uid;

    if (!targetUid) throw new Error('User not authenticated');

    const docRef = doc(this.firestore, 'users', targetUid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() as UserData : null;
  }

  /**
   * Set user as patient with patient information
   */
  async setAsPatient(patientInfo: {
    name: string;
    dateOfBirth?: string;
    medicalId?: string;
    notes?: string;
  }): Promise<void> {
    await this.updateUserProfile({
      role: 'patient',
      patientInfo
    });
  }

  /**
   * Set user as caregiver with caregiver information
   */
  async setAsCaregiver(caregiverInfo: {
    name: string;
    relationship?: string;
    contactPhone?: string;
    notes?: string;
  }): Promise<void> {
    await this.updateUserProfile({
      role: 'caregiver',
      caregiverInfo
    });
  }

  /**
   * Set user as standard user (no special role)
   */
  async setAsStandard(): Promise<void> {
    await this.updateUserProfile({
      role: 'standard'
    });
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

  // ===== CATEGORY MATCH PROGRESS TRACKING =====

  /**
   * Save a Category Match session with automatic accuracy calculation
   */
  async saveCategoryMatchSession(correct: number, total: number): Promise<string> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    if (total <= 0) throw new Error('Total answers must be greater than 0');
    if (correct < 0 || correct > total) throw new Error('Correct answers must be between 0 and total');

    const accuracy = total > 0 ? correct / total : 0;
    const sessionId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const session: CategoryMatchSession = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      correct,
      total,
      accuracy
    };

    // Get current progress
    const currentProgress = await this.getUserProgress();
    if (!currentProgress) throw new Error('User progress not found');

    // Update the sessions object
    const updatedSessions = {
      ...currentProgress.categoryMatch.sessions,
      [sessionId]: session
    };

    // Calculate new overall accuracy
    const allSessions = Object.values(updatedSessions);
    const totalCorrect = allSessions.reduce((sum, s) => sum + s.correct, 0);
    const totalAnswers = allSessions.reduce((sum, s) => sum + s.total, 0);
    const overallAccuracy = totalAnswers > 0 ? totalCorrect / totalAnswers : 0;

    // Update progress with new session
    const updatedProgress: Partial<UserProgress> = {
      categoryMatch: {
        sessions: updatedSessions,
        totalSessions: allSessions.length,
        overallAccuracy
      },
      lastCalculated: new Date().toISOString()
    };

    await this.saveUserProgress(updatedProgress);
    return sessionId;
  }

  /**
   * Get all Category Match sessions for a user
   */
  async getCategoryMatchSessions(userId?: string): Promise<CategoryMatchSession[]> {
    const user = this.getCurrentUser();
    const targetUserId = userId || user?.uid;

    if (!targetUserId) throw new Error('User not authenticated');

    const progress = await this.getUserProgress(targetUserId);
    if (!progress || !progress.categoryMatch) return [];

    return Object.values(progress.categoryMatch.sessions).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get Category Match progress summary for a user
   */
  async getCategoryMatchProgress(userId?: string): Promise<{
    totalSessions: number;
    overallAccuracy: number;
    recentSessions: CategoryMatchSession[];
  } | null> {
    const user = this.getCurrentUser();
    const targetUserId = userId || user?.uid;

    if (!targetUserId) throw new Error('User not authenticated');

    const progress = await this.getUserProgress(targetUserId);
    if (!progress || !progress.categoryMatch) return null;

    const sessions = Object.values(progress.categoryMatch.sessions).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return {
      totalSessions: progress.categoryMatch.totalSessions,
      overallAccuracy: progress.categoryMatch.overallAccuracy,
      recentSessions: sessions.slice(0, 10) // Last 10 sessions
    };
  }

  /**
   * Delete a specific Category Match session
   */
  async deleteCategoryMatchSession(sessionId: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const currentProgress = await this.getUserProgress();
    if (!currentProgress || !currentProgress.categoryMatch) throw new Error('User progress not found');

    // Remove the session
    const updatedSessions = { ...currentProgress.categoryMatch.sessions };
    delete updatedSessions[sessionId];

    // Recalculate overall accuracy
    const allSessions = Object.values(updatedSessions);
    const totalCorrect = allSessions.reduce((sum, s) => sum + s.correct, 0);
    const totalAnswers = allSessions.reduce((sum, s) => sum + s.total, 0);
    const overallAccuracy = totalAnswers > 0 ? totalCorrect / totalAnswers : 0;

    // Update progress
    const updatedProgress: Partial<UserProgress> = {
      categoryMatch: {
        sessions: updatedSessions,
        totalSessions: allSessions.length,
        overallAccuracy
      },
      lastCalculated: new Date().toISOString()
    };

    await this.saveUserProgress(updatedProgress);
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

    // Delete user progress (includes Category Match sessions)
    batch.delete(doc(this.firestore, 'users', user.uid, 'userProgress', 'stats'));

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
