"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

interface TrialRequestModalProps {
  open: boolean;
  onClose: () => void;
}

export function TrialRequestModal({ open, onClose }: TrialRequestModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = trpc.trial.submit.useMutation();

  if (!open) return null;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "First name is required";
    if (!lastName.trim()) errs.lastName = "Last name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Valid email is required";
    if (!companyName.trim()) errs.companyName = "Company name is required";
    if (!companySize) errs.companySize = "Select company size";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    try {
      await submitMutation.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        companyName: companyName.trim(),
        companySize: companySize as any,
      });
      setSubmitted(true);
    } catch (err: any) {
      setErrors({ form: err.message || "Something went wrong. Please try again." });
    }
  }

  function close() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setCompanyName("");
    setCompanySize("");
    setErrors({});
    setSubmitted(false);
    submitMutation.reset();
    onClose();
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
        onClick={close}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "16px",
            maxWidth: "480px",
            width: "100%",
            padding: "40px",
            position: "relative",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={close}
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "#94a3b8",
              lineHeight: 1,
            }}
          >
            &times;
          </button>

          {submitted ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>&#9989;</div>
              <h2 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px", color: "#0f172a" }}>
                Request Submitted!
              </h2>
              <p style={{ color: "#64748b", fontSize: "15px", lineHeight: 1.6, margin: 0 }}>
                We&apos;ve received your trial request. Our team will review it and send you
                access to Drift within 24 hours. Check your inbox for updates.
              </p>
              <button
                onClick={close}
                style={{
                  marginTop: "24px",
                  padding: "12px 32px",
                  borderRadius: "100px",
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Got it
              </button>
            </div>
          ) : (
            <>
              <div style={{ textAlign: "center", marginBottom: "28px" }}>
                <h2 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px", color: "#0f172a" }}>
                  Get Early Access
                </h2>
                <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
                  Fill in your details and we&apos;ll set up your 30-day free trial.
                </p>
              </div>

              {errors.form && (
                <div style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  marginBottom: "16px",
                }}>
                  {errors.form}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <Field label="First Name" error={errors.firstName}>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      style={inputStyle(!!errors.firstName)}
                    />
                  </Field>
                  <Field label="Last Name" error={errors.lastName}>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      style={inputStyle(!!errors.lastName)}
                    />
                  </Field>
                </div>

                <Field label="Email" error={errors.email}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@company.com"
                    style={inputStyle(!!errors.email)}
                  />
                </Field>

                <Field label="Company Name" error={errors.companyName}>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Corp"
                    style={inputStyle(!!errors.companyName)}
                  />
                </Field>

                <Field label="Company Size" error={errors.companySize}>
                  <select
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                    style={{
                      ...inputStyle(!!errors.companySize),
                      appearance: "none",
                      backgroundImage: "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 14px center",
                      paddingRight: "36px",
                    }}
                  >
                    <option value="">Select size</option>
                    {COMPANY_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s} employees
                      </option>
                    ))}
                  </select>
                </Field>

                <p style={{ fontSize: "12px", color: "#94a3b8", margin: "16px 0 0", lineHeight: 1.5 }}>
                  By submitting, you agree to our Terms of Service and Privacy Policy.
                  We&apos;ll never share your information.
                </p>

                <button
                  type="submit"
                  disabled={submitMutation.isPending}
                  style={{
                    width: "100%",
                    marginTop: "20px",
                    padding: "14px",
                    borderRadius: "100px",
                    background: submitMutation.isPending ? "#93c5fd" : "#3b82f6",
                    color: "#fff",
                    border: "none",
                    fontSize: "16px",
                    fontWeight: 600,
                    cursor: submitMutation.isPending ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 14px rgba(59,130,246,0.3)",
                  }}
                >
                  {submitMutation.isPending ? "Submitting..." : "Request Early Access"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
        {label}
      </label>
      {children}
      {error && <p style={{ color: "#dc2626", fontSize: "12px", margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: hasError ? "1.5px solid #dc2626" : "1.5px solid #e2e8f0",
    fontSize: "14px",
    color: "#0f172a",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };
}
