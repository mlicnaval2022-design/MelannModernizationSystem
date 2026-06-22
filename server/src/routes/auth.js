const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../db/database');
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    const user = await dbGet('SELECT * FROM tblUser WHERE username = ? AND is_active = 1', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid username or password' });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name, branch_id: user.branch_id },
      process.env.JWT_SECRET || 'melann_secret', { expiresIn: '12h' }
    );
    await dbRun(`INSERT INTO tblLogtime (user_id, username, action, module, details) VALUES (?,?,?,?,?)`, [user.id, user.username, 'LOGIN', 'AUTH', 'User logged in']);
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, branch_id: user.branch_id } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));

module.exports = router;
