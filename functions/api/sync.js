export async function onRequestPost(context) {
    const { request, env } = context;

    // Získání dat z požadavku
    try {
        const data = await request.json();

        // Uložení do KV (Namespace musí být 'FASTTRACK_KV' v nastavení Cloudflare)
        // Používáme fixní klíč 'user_data' - pro více uživatelů by zde musela být autentizace
        // nebo unikátní ID v URL/Cookies. Pro osobní použití stačí takto.
        await env.FASTTRACK_KV.put('user_data', JSON.stringify(data));

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

export async function onRequestGet(context) {
    const { env } = context;

    // Načtení dat
    const value = await env.FASTTRACK_KV.get('user_data');

    if (!value) {
        return new Response(JSON.stringify(null), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(value, {
        headers: { 'Content-Type': 'application/json' }
    });
}
