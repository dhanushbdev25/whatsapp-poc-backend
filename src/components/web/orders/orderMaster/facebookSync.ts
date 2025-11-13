import axios from "axios";
import FormData from "form-data";

const FB_API_VERSION = "v24.0";
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN!;
const FB_CATALOG_ID = process.env.FB_CATALOG_ID!;

// Create product in Facebook Catalog
export async function fbCreateProduct(product: any) {
  try {
    const url = `https://graph.facebook.com/${FB_API_VERSION}/${FB_CATALOG_ID}/products`;

    const form = new FormData();
    form.append("retailer_id", product.sku);
    form.append("name", product.productName);
    form.append("description", product.description || "No description");
    form.append("price", product.amount);
    form.append("currency", product.currency);
    form.append("availability", product.qty > 0 ? "in stock" : "out of stock");
    form.append("condition", "new");
    form.append("brand", product.brand || "Unknown");
    form.append("image_url", Array.isArray(product.metadata) ? product.metadata[0] : "");
    form.append("url", product.url || "https://example.com");
    form.append("access_token", FB_ACCESS_TOKEN);

    await axios.post(url, form, { headers: form.getHeaders() });
  } catch (err: any) {
    console.error("Facebook CREATE sync failed:", err.response?.data || err);
  }
}

// Update Facebook product (UPSERT)
export async function fbUpdateProduct(sku: string, updateData: any) {
  try {
    const url = `https://graph.facebook.com/${FB_API_VERSION}/${sku}?allow_upsert=true`;

    const form = new FormData();
    Object.entries(updateData).forEach(([k, v]) => form.append(k, v as any));
    form.append("access_token", FB_ACCESS_TOKEN);

    await axios.post(url, form, { headers: form.getHeaders() });
  } catch (err: any) {
    console.error("Facebook UPDATE sync failed:", err.response?.data || err);
  }
}

// Update stock only (after payment)
export async function fbUpdateStock(sku: string, amount: number, quantityLeft: number, currency: string) {
  try {
    await fbUpdateProduct(sku, {
      price: amount,
      availability: quantityLeft > 0 ? "in stock" : "out of stock",
      currency,
    });
  } catch (err) {
    console.error("Facebook stock update failed", err);
  }
}

export async function fbCheckStock(sku: string) {
    try {
        const token = process.env.FB_ACCESS_TOKEN;
        const catalogId = process.env.FB_CATALOG_ID;

        const url =
            `https://graph.facebook.com/v24.0/${catalogId}/products` +
            `?fields=retailer_id,availability` +
            `&access_token=${token}`;

        const fbRes = await axios.get(url);

        const items = fbRes.data?.data || [];

        const product = items.find((p: any) => p.retailer_id === sku);

        if (!product) {
            return { exists: false, availability: "unknown" };
        }

        return {
            exists: true,
            availability: product.availability, // "in stock" / "out of stock"
        };
    } catch (err: any) {
        console.error("Facebook stock check failed:", err?.response?.data || err);
        return { exists: false, availability: "unknown" };
    }
}

