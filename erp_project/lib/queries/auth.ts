/**
 * Authentication Queries
 * Centralized queries for user authentication, sessions, and user roles
 */

export const auth = {
  // ============ SELECT QUERIES ============

  /**
   * Get user by email
   * Returns: { id, name, email, status }
   * Parameters: [email]
   */
  getUserByEmail: `SELECT id, name, email, status FROM users WHERE email = ? LIMIT 1`,

  /**
   * Get user by email (ID only)
   * Returns: { id }
   * Parameters: [email]
   */
  getUserIdByEmail: `SELECT id FROM users WHERE email = ? LIMIT 1`,

  /**
   * Get user roles
   * Returns: [{ role }, ...]
   * Parameters: [user_id]
   */
  getUserRoles: `SELECT role FROM user_roles WHERE user_id = ?`,

  /**
   * Get active session for user
   * Returns: { id, session_id }
   * Parameters: [user_id]
   */
  getActiveSession: `
    SELECT id, session_id FROM sessions 
    WHERE user_id = ? AND is_active = 1 
    ORDER BY created_at DESC LIMIT 1
  `,

  // ============ INSERT QUERIES ============

  /**
   * Insert new session record
   * Parameters: [session_id, user_id, token, expires_at, is_active]
   */
  insertSession: `
    INSERT INTO sessions (session_id, user_id, token, expires_at, is_active) 
    VALUES (?, ?, ?, ?, ?)
  `,

  /**
   * Insert session history event (login/logout)
   * Parameters: [session_id, user_id, event]
   */
  insertSessionHistory: `
    INSERT INTO session_history (session_id, user_id, event) 
    VALUES (?, ?, ?)
  `,

  // ============ UPDATE QUERIES ============

  /**
   * Mark session as inactive
   * Parameters: [session_id]
   */
  deactivateSession: `UPDATE sessions SET is_active = 0 WHERE id = ?`,
}
