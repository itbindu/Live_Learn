// src/components/Teacher/TeacherRegister.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import "./TeacherRegister.css";

const TeacherRegister = () => {
  // ============ STATE MANAGEMENT ============
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [role, setRole] = useState(""); // "class" or "subject"
  const [subject, setSubject] = useState(""); // Single subject for both roles
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

  // ============ DROPDOWN OPTIONS ============
  const roleOptions = [
    { value: "", label: "Select Role" },
    { value: "class", label: "📚 Class Teacher" },
    { value: "subject", label: "📖 Subject Teacher" }
  ];

  const subjectOptions = [
    { value: "", label: "Select Subject" },
    { value: "Java", label: "Java" },
    { value: "C", label: "C" },
    { value: "Python", label: "Python" },
    { value: "C++", label: "C++" }
  ];

  // ============ VALIDATION FUNCTIONS ============
  const isValidName = (name) => /^[A-Za-z]{2,}$/.test(name);
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidPhone = (phone) => /^[6-9]\d{9}$/.test(phone);
  const isValidPassword = (pwd) =>
    /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(pwd);

  // ============ SEND OTP ============
  const handleSendOtp = async (e) => {
    e.preventDefault();
    
    // Validate all fields
    if (!isValidName(firstName)) {
      alert("First name must be at least 2 letters and only alphabets.");
      return;
    }
    if (!isValidName(lastName)) {
      alert("Last name must be at least 2 letters and only alphabets.");
      return;
    }
    if (!isValidEmail(email)) {
      alert("Please enter a valid email address.");
      return;
    }
    if (!isValidPhone(phoneNumber)) {
      alert("Please enter a valid 10-digit phone number starting with 6-9.");
      return;
    }
    
    // Role validation
    if (!role) {
      alert("Please select a role.");
      return;
    }
    
    // Subject validation - required for both roles
    if (!subject) {
      alert("Please select a subject.");
      return;
    }

    // Password validation
    if (!password) {
      alert("Please enter a password.");
      return;
    }
    if (!isValidPassword(password)) {
      alert("Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character (@$!%*?&).");
      return;
    }
    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/teachers/send-otp`, { email });
      if (response.data.success) {
        alert("OTP sent successfully! Please check your email.");
        setIsOtpSent(true);
      } else {
        alert(response.data.message || "Failed to send OTP. Try again.");
      }
    } catch (error) {
      console.error("Error sending OTP:", error);
      alert("Failed to send OTP. Please check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ============ VERIFY OTP & REGISTER ============
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp) {
      alert("Please enter the OTP.");
      return;
    }

    setLoading(true);
    try {
      // Verify OTP
      const verifyResponse = await axios.post(`${API_URL}/api/teachers/verify-otp`, { 
        email, 
        otp 
      });
      
      if (verifyResponse.data.success) {
        alert("OTP verified! Creating account...");
        await handleSignup();
      } else {
        alert(verifyResponse.data.message || "Invalid OTP. Please try again.");
      }
    } catch (error) {
      console.error("OTP verification failed:", error);
      alert("Failed to verify OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ============ FINAL SIGNUP ============
  const handleSignup = async () => {
    try {
      const signupData = {
        firstName,
        lastName,
        email,
        phoneNumber,
        password,
        role,
        subject
      };

      const response = await axios.post(`${API_URL}/api/teachers/signup`, signupData);
      
      if (response.status === 200) {
        alert("Account created successfully! You can now login.");
        navigate("/teacher/login");
      }
    } catch (error) {
      console.error("Signup error:", error);
      alert(`Signup failed: ${error.response?.data?.message || error.message}`);
    }
  };

  // ============ RENDER FORM ============
  return (
    <div className="teacher-register-container">
      <div className="teacher-card">
        {/* Left Image Section */}
        <div className="teacher-image">
          <img
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80"
            alt="Teacher in classroom"
          />
        </div>

        {/* Right Form Section */}
        <div className="teacher-form">
          <h2>Teacher Registration</h2>

          <form onSubmit={isOtpSent ? handleVerifyOtp : handleSendOtp}>
            {!isOtpSent ? (
              <>
                {/* Name Fields */}
                <div className="name-fields">
                  <input
                    type="text"
                    placeholder="First Name *"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Last Name *"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>

                {/* Contact Details */}
                <input
                  type="email"
                  placeholder="Email *"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone Number (10 digits) *"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                />

                {/* Role Dropdown */}
                <div className="dropdown-section">
                  <select 
                    className="custom-dropdown"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    required
                  >
                    {roleOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Dropdown */}
                <div className="dropdown-section">
                  <select 
                    className="custom-dropdown"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  >
                    {subjectOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {role && subject && (
                    <div className="selection-info">
                      <span className="info-badge">
                        {role === "class" 
                          ? "📚 Class Teacher will teach " 
                          : "📖 Subject Teacher will teach "}
                        <strong>{subject}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Password Fields */}
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password *"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <span
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </span>
                </div>

                <div className="password-field">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm Password *"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <span
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                  </span>
                </div>

                <button type="submit" className="btn" disabled={loading}>
                  {loading ? "Sending OTP..." : "Send OTP"}
                </button>
              </>
            ) : (
              <>
                {/* OTP Verification Section */}
                <div className="otp-section">
                  <p className="otp-info">
                    OTP has been sent to <strong>{email}</strong>
                  </p>
                  <input
                    type="text"
                    placeholder="Enter OTP *"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn" disabled={loading}>
                    {loading ? "Verifying..." : "Verify OTP & Register"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsOtpSent(false)}
                  >
                    ← Back to Registration
                  </button>
                </div>
              </>
            )}
          </form>

          <p>
            Already have an account?{" "}
            <span onClick={() => navigate("/teacher/login")} className="toggle-link">
              Login
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeacherRegister;