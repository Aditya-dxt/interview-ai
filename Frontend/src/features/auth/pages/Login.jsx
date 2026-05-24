import React, { useState } from "react";
import { useNavigate, Link } from "react-router";
import "../auth.form.scss";
import { useAuth } from "../hooks/useAuth";
import { motion } from "framer-motion";

const Login = () => {
  const { handleLogin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    await handleLogin({ email, password });
    navigate("/");
  };

  return (
    <main className="auth-page">
      <motion.section
        className="auth-hero"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
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
      </motion.section>

      <motion.section
        className="auth-form-section"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="form-container">
          <div className="brand">
            <div className="brand-dot"></div>
            <span>Interview AI</span>
          </div>
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
          <p className="footer-text">Powered by Generative AI</p>
        </div>
      </motion.section>
    </main>
  );
};

export default Login;
