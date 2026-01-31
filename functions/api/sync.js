export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const data = await request.json();

        // Kontrola zda je KV nakonfigurované
        if (!env.FASTTRACK_KV) {
            // KV není dostupné - vrátíme úspěch, data zůstanou pouze lokálně
            return new Response(JSON.stringify({ success: true, local: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        await env.FASTTRACK_KV.put('user_data', JSON.stringify(data));

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        // Graceful degradation - pokud sync selže, aplikace funguje dál lokálně
        return new Response(JSON.stringify({ success: false, error: e.message, local: true }), {
            status: 200, // Vracíme 200 aby se nezobrazovala chyba
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function onRequestGet(context) {
    const { env } = context;

    try {
        // Kontrola zda je KV nakonfigurované
        if (!env.FASTTRACK_KV) {
            return new Response(JSON.stringify(null), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const value = await env.FASTTRACK_KV.get('user_data');

        if (!value) {
            return new Response(JSON.stringify(null), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(value, {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        // Graceful degradation
        return new Response(JSON.stringify(null), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
