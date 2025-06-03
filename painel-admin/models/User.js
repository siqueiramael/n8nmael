// Modelo de usuário
import pool from '../db/index.js';

class User {
  static async findById(id) {
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return result.rows[0];
  }
  
  static async validatePassword(user, password) {
    // Implementar validação de senha (bcrypt)
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, user.password_hash);
  }
  
  static async getUserPermissions(userId) {
    const result = await pool.query(`
      SELECT p.nome as permission_name 
      FROM usuario_permissoes up
      JOIN permissoes p ON up.permissao_id = p.id
      WHERE up.usuario_id = $1
    `, [userId]);
    return result.rows.map(row => row.permission_name);
  }
}

export default User;