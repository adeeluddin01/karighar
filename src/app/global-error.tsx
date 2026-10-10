"use client";

// Root error boundary — replaces the root layout, so globals.css never loads here.
// Colors are hardcoded on purpose and mirror the sage/forest design tokens.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'Manrope, "Segoe UI", system-ui, sans-serif',
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 20,
          margin: 0,
          background: "#f2f5f3",
          color: "#14201b",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#76867f", marginTop: 8 }}>Please reload the page.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              background: "#ee7118",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "12px 22px",
              fontWeight: 800,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
