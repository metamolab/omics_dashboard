import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly USER_ID_KEY = 'userId';
  private readonly SESSION_ID_KEY = 'sessionId';
  private readonly SESSION_TIMESTAMP_KEY = 'sessionTimestamp';
  
  // Session duration in milliseconds (e.g., 1 hour = 3600000 ms)
  private readonly SESSION_DURATION = 3600000; // 1 hour
  
  private currentSessionId: string | null = null;
  private currentUserId: string | null = null;

  constructor() {
    this.initializeSession();
  }

  private initializeSession() {
    // console.log('[SESSION] Initializing session service');
    
    // Always generate a new session on application start
    this.generateNewSession();
  }

  /**
   * Generates a completely new session, clearing any existing session data
   */
  generateNewSession(): string {
    // console.log('[SESSION] Generating new session');
    
    // Clear any existing session data
    sessionStorage.removeItem(this.SESSION_ID_KEY);
    sessionStorage.removeItem(this.SESSION_TIMESTAMP_KEY);
    
    // Generate new session ID
    this.currentSessionId = crypto.randomUUID();
    
    // Set user ID (default to MasterTest if not set)
    this.currentUserId = sessionStorage.getItem(this.USER_ID_KEY) || 'MasterTest';
    if (!sessionStorage.getItem(this.USER_ID_KEY)) {
      sessionStorage.setItem(this.USER_ID_KEY, this.currentUserId);
    }
    
    // Store new session data
    sessionStorage.setItem(this.SESSION_ID_KEY, this.currentSessionId);
    sessionStorage.setItem(this.SESSION_TIMESTAMP_KEY, Date.now().toString());
    
    // console.log('[SESSION] New session generated:', {
    //   sessionId: this.currentSessionId,
    //   userId: this.currentUserId,
    //   timestamp: new Date().toISOString()
    // });
    
    return this.currentSessionId;
  }

  /**
   * Gets the current session ID, generating a new one if needed
   */
  getSessionId(): string {
    if (!this.currentSessionId) {
      this.currentSessionId = this.generateNewSession();
    }
    return this.currentSessionId;
  }

  /**
   * Gets the current user ID
   */
  getUserId(): string {
    if (!this.currentUserId) {
      this.currentUserId = sessionStorage.getItem(this.USER_ID_KEY) || 'MasterTest';
      if (!sessionStorage.getItem(this.USER_ID_KEY)) {
        sessionStorage.setItem(this.USER_ID_KEY, this.currentUserId);
      }
    }
    return this.currentUserId;
  }

  /**
   * Generates an analysis ID in the format: userId_sessionId
   */
  generateAnalysisId(): string {
    const userId = this.getUserId();
    const sessionId = this.getSessionId();
    return `${userId}_${sessionId}`;
  }

  /**
   * Checks if the current session is still valid
   */
  isSessionValid(): boolean {
    const timestamp = sessionStorage.getItem(this.SESSION_TIMESTAMP_KEY);
    if (!timestamp) {
      return false;
    }
    
    const sessionAge = Date.now() - parseInt(timestamp);
    return sessionAge < this.SESSION_DURATION;
  }

  /**
   * Forces a new session if the current one is expired
   */
  refreshSessionIfNeeded(): string {
    if (!this.isSessionValid()) {
      // console.log('[SESSION] Session expired, generating new session');
      return this.generateNewSession();
    }
    return this.getSessionId();
  }

  /**
   * Manually clear the session
   */
  clearSession() {
    // console.log('[SESSION] Clearing session');
    sessionStorage.removeItem(this.SESSION_ID_KEY);
    sessionStorage.removeItem(this.SESSION_TIMESTAMP_KEY);
    this.currentSessionId = null;
  }

  /**
   * Get session info for debugging
   */
  getSessionInfo() {
    return {
      sessionId: this.currentSessionId,
      userId: this.currentUserId,
      timestamp: sessionStorage.getItem(this.SESSION_TIMESTAMP_KEY),
      isValid: this.isSessionValid()
    };
  }
}
