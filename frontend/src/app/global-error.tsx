'use client';

/**
 * Root error boundary. It replaces the root layout entirely, so it must render
 * its own <html>/<body> and cannot rely on globals.css or next/font — hence the
 * inline styles.
 *
 * Having this file also means the app never falls back to Next's built-in
 * global-error module, which is the one that goes missing from the RSC client
 * manifest when the .next cache is stale.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0A0A0A',
          color: '#e5e2e1',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          padding: 24,
        }}
      >
        <main style={{ maxWidth: 560 }}>
          <p
            style={{
              margin: '0 0 24px',
              paddingLeft: 12,
              borderLeft: '1px solid #ff3333',
              color: '#ff3333',
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            Fatal error
          </p>

          <h1 style={{ margin: '0 0 16px', fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
            The application could not start.
          </h1>

          <p style={{ margin: '0 0 8px', color: '#c8c6c5', fontSize: 14, lineHeight: 1.6 }}>
            {error.message || 'An unexpected error occurred.'}
          </p>

          {error.digest && (
            <p style={{ margin: '0 0 32px', color: '#929090', fontSize: 12 }}>digest: {error.digest}</p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              padding: '14px 28px',
              backgroundColor: '#ff3333',
              color: '#0A0A0A',
              border: '1px solid #ff3333',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
