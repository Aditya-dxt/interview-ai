import React, { useState } from "react";
import { useNavigate, Link } from "react-router";
import { useAuth } from "../hooks/useAuth";

const Register = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { loading, handleRegister } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    await handleRegister({ username, email, password });
    navigate("/");
  };

  if (loading) {
    return (
      <main>
        <h1>Loading.......</h1>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="hero-content">
          <span className="tag">AI Powered Platform</span>

          <h1>
            Crack Your Next
            <span className="highlight"> Technical Interview</span>
          </h1>

          <p>
            Generate personalized interview plans, technical questions, resume
            analysis, and preparation roadmaps using AI.
          </p>

          <div className="hero-features">
            <div>✓ AI Resume Analysis</div>
            <div>✓ Technical Questions</div>
            <div>✓ Skill Gap Reports</div>
            <div>✓ Personalized Roadmaps</div>
          </div>
        </div>
      </section>

      <section className="auth-form-section">
        <div className="form-container">
          <h1>Register</h1>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Username</label>

              <input
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                placeholder="Enter your username"
              />
            </div>

            <div className="input-group">
              <label>Email</label>

              <input
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Enter your email"
              />
            </div>

            <div className="input-group">
              <label>Password</label>

              <input
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Enter your password"
              />
            </div>

            <button className="button primary-button">Register</button>
          </form>

          <p>
            Don't have an account?
            <Link to="/login"> Login</Link>
          </p>
        </div>
      </section>
    </main>
  );
};

export default Register;
