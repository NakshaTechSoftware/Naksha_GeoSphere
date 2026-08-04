"use client";

import { useState } from "react";

export default function TestSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleClick = () => {
    setMessage(`Testing with email: ${email}, password: ${password}`);
    
    if (email === "demo@gmail.com" && password === "Demo@123") {
      setMessage("✅ Credentials match! Redirecting in 2 seconds...");
      setTimeout(() => {
        window.location.href = "/home-page";
      }, 2000);
    } else {
      setMessage("❌ Wrong credentials. Use demo@gmail.com / Demo@123");
    }
  };

  return (
    <div style={{ padding: "50px", fontFamily: "Arial" }}>
      <h1>Test Sign In Page</h1>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ marginBottom: "10px" }}>
          <label>Email:</label>
          <br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "10px", width: "300px" }}
            placeholder="demo@gmail.com"
          />
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label>Password:</label>
          <br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: "10px", width: "300px" }}
            placeholder="Demo@123"
          />
        </div>
        <button
          onClick={handleClick}
          style={{
            padding: "10px 20px",
            background: "#3563E9",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Test Sign In
        </button>
      </div>
      {message && (
        <div
          style={{
            padding: "15px",
            background: message.includes("✅") ? "#d4edda" : "#f8d7da",
            border: "1px solid " + (message.includes("✅") ? "#c3e6cb" : "#f5c6cb"),
            borderRadius: "5px",
            marginTop: "20px",
          }}
        >
          {message}
        </div>
      )}
      <div style={{ marginTop: "30px", padding: "15px", background: "#e7f3ff", borderRadius: "5px" }}>
        <p><strong>Test Credentials:</strong></p>
        <p>Email: demo@gmail.com</p>
        <p>Password: Demo@123</p>
      </div>
    </div>
  );
}
