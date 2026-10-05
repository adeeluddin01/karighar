"use client";

// Root error boundary — replaces the root layout, so globals.css never loads here.
// Colors are hardcoded on purpose and mirror the teal design tokens.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 20,
          margin: 0,
          background: "#f7faf9",
          color: "#17272b",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#6b7f83", marginTop: 8 }}>Please reload the page.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              background: "#0f8a7e",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "12px 22px",
              fontWeight: 600,
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
