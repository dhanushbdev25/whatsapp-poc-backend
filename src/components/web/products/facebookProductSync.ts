import axios from "axios";
import FormData from "form-data";

export async function syncToFacebookCatalog(payload: any) {
    const API_URL = `https://graph.facebook.com/v24.0/${process.env.FB_CATALOG_ID}/products`;
    const token = process.env.FB_ACCESS_TOKEN;

    const form: any = new FormData();
    Object.entries(payload).forEach(([k, v]) => form.append(k, v as any));
    form.append("access_token", token!);

    return axios.post(API_URL, form, {
        headers: form.getHeaders(),
    });
}



export async function fbUpdateProductStock(options: {
    sku: string;
    amount: number;
    qty: number;
}) {
    try {
        const { sku, amount, qty } = options;

        const API_URL = `https://graph.facebook.com/v24.0/${sku}?allow_upsert=true`;
        const token = process.env.FB_ACCESS_TOKEN;

        const form = new FormData();
        form.append("price", String(amount));
        form.append("availability", qty > 0 ? "in stock" : "out of stock");
        form.append("access_token", token!);

        const data = await axios.post(API_URL, form, {
            headers: form.getHeaders(),
        });

        return { success: true, data: data };
    } catch (error: any) {
        console.error("Facebook Product Sync Failed:", error?.response?.data || error);
        return { success: false, error };
    }
}

