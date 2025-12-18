export default async (req) => {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
        return new Response("Missing url param", { status: 400 });
    }

    console.log(`[Proxy] Forwarding to: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
            },
        });

        // Netlify functions might follow redirects automatically, but let's just return the body
        const text = await response.text();
        const contentType = response.headers.get("content-type") || "text/html";

        return new Response(text, {
            status: response.status,
            headers: {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (error) {
        console.error("Proxy error:", error);
        return new Response(`Proxy Error: ${error.message}`, { status: 500 });
    }
};

export const config = {
    path: "/proxy"
};
