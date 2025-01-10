const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const router = express.Router();

// Registration API
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  // Validate the required fields
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, and password are required" });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Error registering user", details: err.message });
  }
});

// Login API
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // Validate the required fields
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Invalid username or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid username or password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ error: "Error logging in", details: err.message });
  }
});

// Forgot Password API
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  // Validate email field
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Email not found" });

    // Generate a password reset token
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: user.email,
      subject: "Password Reset",
      text: `Click the link to reset your password: http://localhost:5000/reset-password/${resetToken}`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Password reset link sent to email" });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Error sending email", details: err.message });
  }
});

// Reset Password API
router.post("/reset-password/:resetToken", async (req, res) => {
  const { resetToken } = req.params;
  const { newPassword } = req.body;

  // Validate the newPassword field
  if (!newPassword) {
    return res.status(400).json({ error: "New password is required" });
  }

  try {
    // Verify the JWT token
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);

    // Find the user based on the decoded ID
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password has been successfully reset" });
  } catch (err) {
    console.error("Reset password error:", err);

    // Handle specific JWT errors
    if (err.name === "TokenExpiredError") {
      return res.status(400).json({ error: "Token has expired. Please request a new password reset link." });
    } else if (err.name === "JsonWebTokenError") {
      return res.status(400).json({ error: "Invalid token. Please check the reset link." });
    }

    res.status(500).json({ error: "Error resetting password", details: err.message });
  }
});


module.exports = router;
