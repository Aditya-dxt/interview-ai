import React, { useState } from "react";
import { useNavigate, Link } from "react-router";
import "../auth.form.scss";
import { useAuth } from "../hooks/useAuth";

const Login = () => {
  const { loading, handleLogin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    await handleLogin({ email, password });
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
          <h1>Login</h1>

          <form onSubmit={handleSubmit}>
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

            <button className="button primary-button">Login</button>
          </form>

          <p>
            Don't have an account?
            <Link to="/register"> Register</Link>
          </p>
        </div>
      </section>
    </main>
  );
};

export default Login;
