// Handle OneSignal SDK Worker requests (likely from browser extensions)
// Returns empty response to prevent 404 errors
export async function GET() {
  return new Response(null, {
    status: 204, // No Content
    headers: {
      'Content-Type': 'application/javascript',
    },
  })
}

