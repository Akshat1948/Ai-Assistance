"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sparkles, Mail, Lock, User, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const router = useRouter();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (isRegister) {
      // Register logic
      try {
        const res = await fetch(`${apiBaseUrl}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password, name: name || null }),
        });

        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.detail || "Registration failed");
        }

        setSuccess("Account created successfully! Logging you in...");
        
        // Auto sign-in after registration
        const loginRes = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (loginRes?.error) {
          setError("Account created, but automatic login failed. Please sign in manually.");
          setIsRegister(false);
        } else {
          router.push("/");
          router.refresh();
        }
      } catch (err: any) {
        setError(err.message || "Registration failed. Please try again.");
      } finally {
        setLoading(false);
      }
    } else {
      // Login logic
      try {
        const res = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (res?.error) {
          setError("Invalid email or password");
        } else {
          router.push("/");
          router.refresh();
        }
      } catch (err) {
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#06070a] px-4 overflow-hidden">
      {/* Decorative ambient blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-indigo-600/10 blur-[100px] animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] rounded-full bg-violet-600/10 blur-[100px] animate-pulse-slow" style={{ animationDelay: "3s" }}></div>

      <div className="w-full max-w-md z-10">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25 mb-4">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
            Welcome to Aether
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            {isRegister
              ? "Create your account to start conversations"
              : "Sign in to access your personal AI assistant"}
          </p>
        </div>

        {/* Form Card */}
        <div className="glass-panel rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center font-medium">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs text-center font-medium">
                {success}
              </div>
            )}

            {isRegister && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block ml-1">
                  Full Name
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                    <User className="h-4.5 w-4.5" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white glass-input outline-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block ml-1">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                  <Mail className="h-4.5 w-4.5" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white glass-input outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block ml-1">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                  <Lock className="h-4.5 w-4.5" />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white glass-input outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : isRegister ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* Toggle Tab */}
          <div className="mt-8 text-center border-t border-white/5 pt-6">
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError(null);
                setSuccess(null);
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors underline decoration-indigo-500/50 underline-offset-4"
            >
              {isRegister
                ? "Already have an account? Sign In"
                : "Don't have an account? Register here"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
